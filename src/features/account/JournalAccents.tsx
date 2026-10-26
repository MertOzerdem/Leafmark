import React from 'react';
import { StyleSheet, View } from 'react-native';

const trailDots = [
  { left: 60, top: 7 },
  { left: 72, top: 13 },
  { left: 83, top: 24 },
  { left: 88, top: 38 },
  { left: 82, top: 51 },
  { left: 70, top: 60 },
  { left: 59, top: 70 },
  { left: 57, top: 83 },
  { left: 66, top: 94 },
];

const foliageStems = [
  { left: 8, height: 104, rotation: '-15deg' },
  { left: 40, height: 132, rotation: '-4deg' },
  { left: 76, height: 92, rotation: '12deg' },
];

const leaves = [
  { left: 2, top: 18, rotation: '-40deg' },
  { left: 8, top: 34, rotation: '38deg' },
  { left: 0, top: 51, rotation: '-42deg' },
  { left: 8, top: 69, rotation: '40deg' },
  { left: 1, top: 86, rotation: '-37deg' },
];

export function JournalAccents() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.butterflyTrail}>
        {trailDots.map((dot, index) => (
          <View key={index} style={[styles.trailDot, dot]} />
        ))}
        <Butterfly />
      </View>
      <Foliage style={styles.leftFoliage} />
      <Foliage style={styles.rightFoliage} />
    </View>
  );
}

function Butterfly() {
  return (
    <View style={styles.butterfly}>
      <View style={[styles.wing, styles.upperLeftWing]} />
      <View style={[styles.wing, styles.upperRightWing]} />
      <View style={[styles.wing, styles.lowerLeftWing]} />
      <View style={[styles.wing, styles.lowerRightWing]} />
      <View style={styles.butterflyBody} />
    </View>
  );
}

function Foliage({ style }: { style: object }) {
  return (
    <View style={[styles.foliage, style]}>
      {foliageStems.map((stem) => (
        <View
          key={stem.left}
          style={[styles.stem, { height: stem.height, left: stem.left, transform: [{ rotate: stem.rotation }] }]}
        >
          {leaves.map((leaf, index) => (
            <View
              key={index}
              style={[
                styles.leaf,
                {
                  left: index % 2 === 0 ? -8 : 1,
                  top: leaf.top,
                  transform: [{ rotate: leaf.rotation }],
                },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  butterflyTrail: { height: 125, position: 'absolute', right: 12, top: 18, width: 105 },
  trailDot: {
    backgroundColor: '#898674',
    borderRadius: 2,
    height: 3,
    opacity: 0.6,
    position: 'absolute',
    width: 3,
  },
  butterfly: { height: 24, left: 9, position: 'absolute', top: 0, transform: [{ rotate: '18deg' }], width: 28 },
  wing: { borderColor: '#898674', borderRadius: 12, borderWidth: 1, position: 'absolute' },
  upperLeftWing: { height: 14, left: 1, top: 0, transform: [{ rotate: '-22deg' }], width: 11 },
  upperRightWing: { height: 14, right: 1, top: 0, transform: [{ rotate: '22deg' }], width: 11 },
  lowerLeftWing: { height: 10, left: 4, top: 10, transform: [{ rotate: '28deg' }], width: 9 },
  lowerRightWing: { height: 10, right: 4, top: 10, transform: [{ rotate: '-28deg' }], width: 9 },
  butterflyBody: { backgroundColor: '#898674', borderRadius: 2, height: 17, left: 13, position: 'absolute', top: 4, width: 1.5 },
  foliage: { bottom: -26, height: 160, opacity: 0.48, position: 'absolute', width: 130 },
  leftFoliage: { left: -4 },
  rightFoliage: { right: -18, transform: [{ scaleX: -1 }] },
  stem: { backgroundColor: '#9DA086', bottom: 0, position: 'absolute', width: 1.5 },
  leaf: {
    backgroundColor: '#E4E4D8',
    borderColor: '#A5A68F',
    borderRadius: 10,
    borderWidth: 0.6,
    height: 20,
    position: 'absolute',
    width: 8,
  },
});
