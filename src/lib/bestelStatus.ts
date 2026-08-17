/**
 * De twee eindstatussen van een bestelling. Alles daarbuiten telt als "loopt nog" --
 * gebruikt door de blokkade op het deactiveren van een materiaal. De volledige
 * statuslijst staat als union-type in BestellingenSection.tsx.
 */
export const AFGEHANDELDE_BESTELSTATUSSEN = ['Betaald en afgerond', 'Afgewezen'] as const;
