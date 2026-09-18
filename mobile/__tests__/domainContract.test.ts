import type {
  Entry,
  MediaItem,
  Place,
  PublicShareReadResult,
  ShareItem,
  ShareSnapshot,
} from '../src/domain/types';
import {
  CLOUD_TABLES,
  PRIVATE_MEDIA_BUCKET,
  SHARE_MEDIA_BUCKET,
  privateDisplayPath,
  privateThumbPath,
  shareCoverPath,
} from '../src/domain/types';
import {
  entryToRow,
  mediaToRow,
  placeToRow,
  publicShareToSnapshot,
  shareItemToPayload,
  shareItemToRow,
  shareSnapshotToRow,
} from '../src/domain/mapping';

const CREATED_AT = '2026-09-18T00:00:00.000Z';
const UPDATED_AT = '2026-09-18T01:00:00.000Z';

const place: Place = {
  id: 'p1',
  name: '西海岸日落咖啡',
  area: '海口 · 西海岸',
  lat: 20.0458,
  lng: 110.2216,
  coordPrecision: 'exact',
  isPrivate: false,
  revision: 3,
  baseRevision: 2,
  demo: false,
  sync: 'local',
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

const entry: Entry = {
  id: 'e1',
  placeId: 'p1',
  visitDate: '2026-09-18',
  rating: 4,
  budget: 50,
  transcript: '私密转写',
  notePrivate: '私密感受',
  notePublic: '公开理由',
  summary: '一句话摘要',
  coverMediaId: 'm1',
  tagIds: ['t1'],
  isPrivate: false,
  revision: 1,
  sync: 'local',
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

const media: MediaItem = {
  id: 'm1',
  entryId: 'e1',
  placeId: 'p1',
  localDisplayPath: 'file:///documents/display.jpg',
  localThumbPath: 'file:///documents/thumb.jpg',
  width: 2560,
  height: 1920,
  bytes: 1234,
  order: 0,
  remotePath: privateDisplayPath('owner-1', 'p1', 'm1'),
  remoteThumbPath: privateThumbPath('owner-1', 'p1', 'm1'),
  sync: 'synced',
};

const shareItem: ShareItem = {
  clientId: 'c1',
  entryId: 'e1',
  coverMediaId: 'm1',
  placeName: '西海岸日落咖啡',
  area: '海口 · 西海岸',
  rating: 4,
  budget: 50,
  reason: '公开理由',
  tags: ['约会', '咖啡'],
  coverUri: 'file:///documents/thumb.jpg',
  photos: ['file:///documents/display.jpg'],
  lat: 20.05,
  lng: 110.22,
  coordHidden: false,
};

const snapshot: ShareSnapshot = {
  id: 's1',
  slug: 'abcdefghijklmnopqrstuv',
  kind: 'single',
  title: '西海岸日落咖啡',
  ownerName: 'owner-name',
  items: [shareItem],
  status: 'active',
  createdAt: CREATED_AT,
};

describe('domain contract: 8 cloud tables', () => {
  it('locks the exact habit_tracker table set', () => {
    expect([...CLOUD_TABLES]).toEqual([
      'places',
      'entries',
      'media',
      'tag_dimensions',
      'tags',
      'entry_tags',
      'share_snapshots',
      'share_items',
    ]);
  });
});

describe('domain contract: storage buckets', () => {
  it('uses the two existing buckets with the approved paths', () => {
    expect(PRIVATE_MEDIA_BUCKET).toBe('habit-tracker-media-private');
    expect(SHARE_MEDIA_BUCKET).toBe('habit-tracker-media-share');
    expect(privateDisplayPath('owner-1', 'p1', 'm1')).toBe('owner-1/p1/m1/display.jpg');
    expect(privateThumbPath('owner-1', 'p1', 'm1')).toBe('owner-1/p1/m1/thumb.jpg');
    expect(shareCoverPath('owner-1', 's1', 'c1')).toBe('owner-1/s1/c1.jpg');
  });
});

describe('domain contract: row mapping', () => {
  it('maps Place camelCase to snake_case with client id and rev', () => {
    const row = placeToRow(place, 'owner-1');
    expect(row).toMatchObject({
      id: 'p1',
      owner_user_id: 'owner-1',
      name: '西海岸日落咖啡',
      area: '海口 · 西海岸',
      coord_precision: 'exact',
      is_private: false,
      client_id: 'p1',
      revision: 3,
      updated_at: UPDATED_AT,
    });
    expect(row.lat).toBe(20.0458);
  });

  it('defaults coord_precision to exact when unset', () => {
    const row = placeToRow({ ...place, coordPrecision: undefined }, 'owner-1');
    expect(row.coord_precision).toBe('exact');
  });

  it('maps Entry private and public fields separately', () => {
    const row = entryToRow(entry, 'owner-1');
    expect(row.note_private).toBe('私密感受');
    expect(row.note_public).toBe('公开理由');
    expect(row.transcript).toBe('私密转写');
    expect(row.cover_media_id).toBe('m1');
    expect(row.client_id).toBe('e1');
  });

  it('maps MediaItem to paths and rejects a row without remotePath', () => {
    const row = mediaToRow(media, 'owner-1');
    expect(row.storage_path).toBe('owner-1/p1/m1/display.jpg');
    expect(row.thumb_path).toBe('owner-1/p1/m1/thumb.jpg');
    expect(row.sort_order).toBe(0);
    expect(row.client_id).toBe('m1');
    expect(() => mediaToRow({ ...media, remotePath: undefined }, 'owner-1')).toThrow();
  });
});

describe('domain contract: share whitelist', () => {
  it('emits only the 7 base whitelist keys and never leaks private fields', () => {
    const payload = shareItemToPayload(shareItem);
    expect(Object.keys(payload).sort()).toEqual(
      ['area', 'budget', 'coord_precision', 'name', 'note_public', 'rating', 'tags'].sort(),
    );
    expect(payload).not.toHaveProperty('entryId');
    expect(payload).not.toHaveProperty('photos');
    expect(payload).not.toHaveProperty('lat');
    expect(payload).not.toHaveProperty('lng');
    expect(payload.coord_precision).toBe('approx');
  });

  it('hides coordinates when coordHidden is set', () => {
    expect(shareItemToPayload({ ...shareItem, coordHidden: true }).coord_precision).toBe('hidden');
  });

  it('builds a share snapshot row and item row with cover_url', () => {
    const srow = shareSnapshotToRow(snapshot, 'owner-1');
    expect(srow).toMatchObject({ id: 's1', owner_user_id: 'owner-1', client_id: 's1', status: 'active' });
    expect(srow.payload).toEqual({ title: snapshot.title, owner_display_name: 'owner-name', created_at: CREATED_AT });
    const irow = shareItemToRow(snapshot, shareItem, 'owner-1', 0, 'https://example.com/cover.jpg');
    expect(irow.snapshot_id).toBe('s1');
    expect(irow.client_id).toBe('c1');
    expect(irow.item.cover_url).toBe('https://example.com/cover.jpg');
    expect(irow.item.note_public).toBe('公开理由');
  });
});

describe('domain contract: public_share_read RPC', () => {
  const result: PublicShareReadResult = {
    snapshot: {
      id: 's1',
      slug: 'abcdefghijklmnopqrstuv',
      kind: 'single',
      title: '西海岸日落咖啡',
      owner_display_name: 'owner-name',
      created_at: CREATED_AT,
    },
    items: [
      {
        id: 'i1',
        sort_order: 0,
        item: {
          name: '西海岸日落咖啡',
          area: '海口 · 西海岸',
          rating: 4,
          budget: 50,
          note_public: '公开理由',
          tags: ['约会'],
          coord_precision: 'hidden',
          cover_url: 'https://example.com/cover.jpg',
        },
      },
    ],
  };

  it('maps the nested RPC result into a local snapshot', () => {
    const snap = publicShareToSnapshot(result, 'single');
    expect(snap?.ownerName).toBe('owner-name');
    expect(snap?.items[0]).toMatchObject({
      placeName: '西海岸日落咖啡',
      budget: 50,
      reason: '公开理由',
      coordHidden: true,
      coverUri: 'https://example.com/cover.jpg',
    });
  });

  it('rejects a kind mismatch', () => {
    expect(publicShareToSnapshot(result, 'list')).toBeNull();
  });
});
