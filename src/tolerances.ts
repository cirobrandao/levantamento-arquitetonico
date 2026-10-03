export const geometryTolerance = {
  numericalEpsilon: 1e-8,
  closureWarningM: 0.05,
  diagonalDifferenceWarningM: 0.05,
  angleDifferenceWarningDegrees: 1,
} as const

export function closureSeverity(distanceM: number) {
  return distanceM <= geometryTolerance.numericalEpsilon ? 'closed'
    : distanceM > geometryTolerance.closureWarningM ? 'warning' : 'approximate'
}
