import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface RatingStarsProps {
  rating: number | null;
  size?: number;
  color?: string;
}

export function RatingStars({ color = '#75684E', rating, size = 22 }: RatingStarsProps) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={rating === null ? 'Not rated' : `${rating} ${rating === 1 ? 'star' : 'stars'}`}
      style={styles.row}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const starNumber = index + 1;
        const fill = rating === null || rating < starNumber - 0.5 ? 0 : rating < starNumber ? 0.5 : 1;
        return (
          <View key={starNumber} style={{ height: size + 3, width: size + 3 }}>
            <Text accessible={false} style={[styles.star, { color, fontSize: size, lineHeight: size + 3, width: size + 3 }]}>☆</Text>
            {fill > 0 ? (
              <View pointerEvents="none" style={[styles.fillClip, { width: (size + 3) * fill }]}>
                <Text accessible={false} style={[styles.star, styles.filledStar, { color, fontSize: size, lineHeight: size + 3, width: size + 3 }]}>★</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  star: { left: 0, position: 'absolute', top: 0 },
  filledStar: { top: 0 },
  fillClip: { bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', top: 0 },
});
