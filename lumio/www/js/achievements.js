// Trophies: long-term goals that pay out coins once.
const perfect = (S) => Object.values(S.stars).filter((v) => v === 3).length;

export const ACHIEVEMENTS = [
  { id: 'first', icon: '🌱', reward: 20, test: (S) => S.level > 1 },
  { id: 'lvl10', icon: '🔟', reward: 50, test: (S) => S.level > 10 },
  { id: 'lvl25', icon: '🚀', reward: 100, test: (S) => S.level > 25 },
  { id: 'lvl50', icon: '🌟', reward: 200, test: (S) => S.level > 50 },
  { id: 'lvl100', icon: '👑', reward: 500, test: (S) => S.level > 100 },
  { id: 'perfect10', icon: '⭐', reward: 75, test: (S) => perfect(S) >= 10 },
  { id: 'perfect50', icon: '💫', reward: 250, test: (S) => perfect(S) >= 50 },
  { id: 'streak3', icon: '🔥', reward: 50, test: (S) => S.bestStreak >= 3 },
  { id: 'streak7', icon: '📅', reward: 150, test: (S) => S.bestStreak >= 7 },
  { id: 'streak30', icon: '🏆', reward: 600, test: (S) => S.bestStreak >= 30 },
  { id: 'boss', icon: '⚡', reward: 80, test: (S) => S.stats.bossNoHint >= 1 },
  { id: 'rush10', icon: '⏱️', reward: 150, test: (S) => S.rushBest >= 10 },
  { id: 'collector', icon: '🎨', reward: 100, test: (S) => S.owned.length >= 3 },
];

/** Unlocks every trophy whose goal is met; returns the newly unlocked ones. */
export function checkAchievements(S) {
  const fresh = ACHIEVEMENTS.filter((a) => !S.achievements.includes(a.id) && a.test(S));
  for (const a of fresh) {
    S.achievements.push(a.id);
    S.coins += a.reward;
  }
  return fresh;
}
