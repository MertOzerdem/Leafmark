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
  { left: '0%', height: 105, rotation: '-16deg' },
  { left: '6%', height: 146, rotation: '-8deg' },
  { left: '13%', height: 122, rotation: '9deg' },
  { left: '20%', height: 171, rotation: '-10deg' },
  { left: '27%', height: 114, rotation: '8deg' },
  { left: '34%', height: 156, rotation: '-7deg' },
  { left: '41%', height: 128, rotation: '11deg' },
  { left: '48%', height: 178, rotation: '-12deg' },
  { left: '55%', height: 112, rotation: '8deg' },
  { left: '62%', height: 152, rotation: '-9deg' },
  { left: '69%', height: 126, rotation: '12deg' },
  { left: '76%', height: 169, rotation: '-6deg' },
  { left: '83%', height: 111, rotation: '10deg' },
  { left: '89%', height: 154, rotation: '-8deg' },
  { left: '95%', height: 132, rotation: '8deg' },
];

const leaves = [
  { top: 15, rotation: '-43deg' },
  { top: 29, rotation: '40deg' },
  { top: 43, rotation: '-39deg' },
  { top: 57, rotation: '42deg' },
  { top: 71, rotation: '-40deg' },
  { top: 85, rotation: '37deg' },
  { top: 99, rotation: '-42deg' },
  { top: 113, rotation: '40deg' },
  { top: 127, rotation: '-39deg' },
  { top: 141, rotation: '42deg' },
  { top: 155, rotation: '-38deg' },
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
      <Foliage style={styles.bottomFoliage} />
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
          {leaves.filter((leaf) => leaf.top < stem.height).map((leaf, index) => (
            <View
              key={leaf.top}
              style={[
                styles.leaf,
                {
                  left: index % 2 === 0 ? -7 : 1,
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
  butterflyTrail: { height: 125, position: 'absolute', right: 12, top: 150, width: 105 },
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
  foliage: { bottom: -30, height: 190, opacity: 0.55, position: 'absolute' },
  bottomFoliage: { left: 0, right: 0, width: '100%' },
  stem: { backgroundColor: '#9DA086', bottom: 0, position: 'absolute', width: 1.5 },
  leaf: {
    backgroundColor: '#E4E4D855',
    borderColor: '#A5A68F',
    borderRadius: 10,
    borderWidth: 0.6,
    height: 24,
    position: 'absolute',
    width: 8,
  },
});
