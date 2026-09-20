// 灯箱相册（对标 Web `src/components/Lightbox.tsx`）：点图放大 → 左右滑动翻页 →
// 计数 + 圆点定位 → 设为封面走显式按钮 → 关闭。
// 弹层复用移动端既有 Modal 口径（见 ui.tsx 的 Sheet / ConfirmDialog），不引入新依赖。

import { useEffect, useRef } from 'react'
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { Image } from 'expo-image'

import { colors } from '../theme'

export function Lightbox({
  visible,
  images,
  index,
  onIndex,
  onClose,
  coverIndex,
  onSetCover,
}: {
  visible: boolean
  /** 待预览图 URI（顺序与列表一致）。 */
  images: string[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
  /** 封面位（默认 0 = 首图）。 */
  coverIndex?: number
  /** 传入才显示「设为封面」按钮。 */
  onSetCover?: (index: number) => void
}) {
  const width = Dimensions.get('window').width
  const scrollRef = useRef<ScrollView>(null)
  const total = images.length

  // 外部（箭头/圆点/父级）改 index 时同步滚动位置；滑动本身回报同一个 index，滚到同位是 no-op。
  useEffect(() => {
    if (!visible) return
    scrollRef.current?.scrollTo({ x: index * width, animated: false })
  }, [visible, index, width])

  if (total === 0) return null
  const current = Math.min(Math.max(index, 0), total - 1)
  const isCover = coverIndex === current

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width)
    if (next >= 0 && next < total && next !== current) onIndex(next)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop} accessibilityViewIsModal accessibilityLabel="照片预览">
        <View style={styles.topBar}>
          <Text style={styles.counter}>{`${current + 1} / ${total}`}</Text>
          <View style={styles.topActions}>
            {onSetCover ? (
              isCover ? (
                <Text style={styles.coverBadge}>封面</Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="设为封面"
                  onPress={() => onSetCover(current)}
                  style={styles.topButton}
                  hitSlop={6}
                >
                  <Text style={styles.topButtonText}>设为封面</Text>
                </Pressable>
              )
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭预览"
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={8}
            >
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          style={styles.pager}
        >
          {images.map((uri, i) => (
            <View key={`${uri}-${i}`} style={[styles.page, { width }]}>
              <Image
                source={{ uri }}
                style={styles.image}
                contentFit="contain"
                accessibilityLabel={`第 ${i + 1} 张照片`}
              />
            </View>
          ))}
        </ScrollView>

        {total > 1 ? (
          <View style={styles.dots}>
            {images.map((_, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`第 ${i + 1} 张`}
                onPress={() => onIndex(i)}
                hitSlop={6}
                style={[styles.dot, i === current && styles.dotActive]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 8,
  },
  counter: { color: colors.white, fontSize: 13, opacity: 0.85 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  topButtonText: { color: colors.white, fontSize: 12 },
  coverBadge: {
    color: colors.white,
    fontSize: 12,
    backgroundColor: colors.terra,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: colors.white, fontSize: 17, lineHeight: 20 },
  pager: { flex: 1 },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { width: 18, backgroundColor: colors.white },
})
