import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import { createRepository, type Repository } from '../../db/repository'
import type { MediaFileSystem } from '../localFiles'
import type { ImageProcessor } from '../processImage'
import type { PickedAsset } from '../picker'
import { persistPickedMedia, type MediaServiceDeps } from '../mediaService'

function setup(): { db: SqlDatabase; repo: Repository } {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  const repo = createRepository(db)
  repo.saveCoreEntity('places', { id: 'p1', name: '地点', coord_precision: 'exact', is_private: 0 })
  repo.saveEntityWithOutbox(
    'entries',
    { id: 'e1', place_id: 'p1', visit_date: '2026-09-18', is_private: 0 },
    { kind: 'upsert_entry', entityId: 'e1' },
  )
  return { db, repo }
}

/** 内存文件系统：copy 时按源文件名给 display=1000 / thumb=100 字节。 */
class FakeFileSystem implements MediaFileSystem {
  files = new Map<string, number>()

  documentDirectoryUri() {
    return 'file:///documents/'
  }
  ensureDirectory() {
    /* no-op */
  }
  copy(sourceUri: string, destinationUri: string) {
    this.files.set(destinationUri, sourceUri.includes('thumb') ? 100 : 1000)
  }
  size(uri: string) {
    return this.files.get(uri) ?? 0
  }
  remove(uri: string) {
    this.files.delete(uri)
  }
  exists(uri: string) {
    return this.files.has(uri)
  }
}

function fakeImages(failOn?: string): ImageProcessor {
  return {
    async process(sourceUri) {
      if (sourceUri === failOn) throw new Error(`process failed: ${sourceUri}`)
      return {
        displayUri: `cache/display-${sourceUri}.jpg`,
        thumbUri: `cache/thumb-${sourceUri}.jpg`,
        width: 2560,
        height: 1920,
      }
    },
  }
}

function deps(fs: FakeFileSystem, failOn?: string, ids: string[] = []): MediaServiceDeps {
  let cursor = 0
  return {
    fs,
    images: fakeImages(failOn),
    newId: () => ids[cursor++] ?? `m${cursor}`,
  }
}

const ASSETS: PickedAsset[] = [
  { uri: 'a.jpg', width: 4000, height: 3000 },
  { uri: 'b.jpg', width: 4000, height: 3000 },
  { uri: 'c.jpg', width: 4000, height: 3000 },
]

describe('persistPickedMedia（T048/T049/T050）', () => {
  it('临时 URI 复制到持久目录，media 行落库且 remote 字段置空', async () => {
    const { repo } = setup()
    const fs = new FakeFileSystem()

    const saved = await persistPickedMedia(deps(fs, undefined, ['m1']), repo, {
      assets: [ASSETS[0]],
      entryId: 'e1',
      placeId: 'p1',
    })

    expect(saved).toHaveLength(1)
    expect(saved[0].localDisplayPath).toBe(
      'file:///documents/place-journal/media/e1/m1/source-or-display.jpg',
    )
    expect(saved[0].localThumbPath).toBe('file:///documents/place-journal/media/e1/m1/thumb.jpg')
    expect(fs.exists(saved[0].localDisplayPath)).toBe(true)
    expect(fs.exists(saved[0].localThumbPath)).toBe(true)
    expect(saved[0].bytes).toBe(1100)

    const row = repo.get<{ remote_path: null; remote_thumb_path: null; sync_status: string }>('media', 'm1')
    expect(row).toMatchObject({ remote_path: null, remote_thumb_path: null, sync_status: 'local' })
  })

  it('顺序稳定 + 尺寸/字节落库 + upload op 关联 entry 依赖', async () => {
    const { db, repo } = setup()
    const fs = new FakeFileSystem()

    const saved = await persistPickedMedia(deps(fs, undefined, ['m1', 'm2', 'm3']), repo, {
      assets: ASSETS,
      entryId: 'e1',
      placeId: 'p1',
      dependsOn: ['op-entry'],
      now: '2026-09-18T00:00:00.000Z',
    })

    expect(saved.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
    expect(saved.map((m) => m.order)).toEqual([0, 1, 2])
    expect(saved.map((m) => m.width)).toEqual([2560, 2560, 2560])
    expect(saved.map((m) => m.bytes)).toEqual([1100, 1100, 1100])

    const ops = db.getAllSync<{ kind: string; entity_id: string; depends_on: string }>(
      'SELECT kind, entity_id, depends_on FROM outbox WHERE kind = ? ORDER BY seq ASC',
      'upload_media',
    )
    expect(ops.map((o) => o.entity_id)).toEqual(['m1', 'm2', 'm3'])
    expect(JSON.parse(ops[2].depends_on)).toEqual(['op-entry'])
  })

  it('封面=首图：entry.cover_media_id 指向第一张', async () => {
    const { repo } = setup()
    const fs = new FakeFileSystem()

    await persistPickedMedia(deps(fs, undefined, ['m1', 'm2']), repo, {
      assets: [ASSETS[0], ASSETS[1]],
      entryId: 'e1',
      placeId: 'p1',
    })

    expect(repo.get<{ cover_media_id: string }>('entries', 'e1')?.cover_media_id).toBe('m1')
  })

  it('处理失败：删除已复制文件、不落 media 行与 op（失败回滚）', async () => {
    const { db, repo } = setup()
    const fs = new FakeFileSystem()

    await expect(
      persistPickedMedia(deps(fs, 'b.jpg', ['m1', 'm2']), repo, {
        assets: [ASSETS[0], ASSETS[1]],
        entryId: 'e1',
        placeId: 'p1',
      }),
    ).rejects.toThrow(/process failed: b\.jpg/)

    expect(repo.all('media')).toHaveLength(0)
    expect(db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE kind = 'upload_media'")?.n).toBe(0)
    expect(fs.files.size).toBe(0)
    expect(repo.get<{ cover_media_id: string | null }>('entries', 'e1')?.cover_media_id).toBeNull()
  })

  it('DB 落库失败：清理已复制文件后抛错', async () => {
    const { repo } = setup()
    const fs = new FakeFileSystem()
    const failingRepo: Repository = {
      ...repo,
      saveMediaBatch() {
        throw new Error('db write failed')
      },
    }

    await expect(
      persistPickedMedia(deps(fs, undefined, ['m1']), failingRepo, {
        assets: [ASSETS[0]],
        entryId: 'e1',
        placeId: 'p1',
      }),
    ).rejects.toThrow('db write failed')

    expect(fs.files.size).toBe(0)
  })

  it('空选择：不落库、不报错', async () => {
    const { repo } = setup()
    const fs = new FakeFileSystem()

    const saved = await persistPickedMedia(deps(fs), repo, { assets: [], entryId: 'e1', placeId: 'p1' })

    expect(saved).toEqual([])
    expect(repo.all('media')).toHaveLength(0)
  })
})
