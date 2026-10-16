import type { PropertyRow } from './transformers';

export type InteractionType =
  | 'view'
  | 'like'
  | 'bookmark'
  | 'chat'
  | 'booking'
  | 'rating'
  | 'filter';

export interface RecommendationWeights {
  price: number;
  distance: number;
  facilities: number;
  rating: number;
  verification: number;
}

export interface InteractionEvent {
  id: string;
  userKey: string;
  propertyId: string;
  interactionType: InteractionType;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export const DEFAULT_RECOMMENDATION_WEIGHTS: RecommendationWeights = {
  price: 0.30,
  distance: 0.20,
  facilities: 0.25,
  rating: 0.15,
  verification: 0.10
};

export const INTERACTION_SIGNAL_WEIGHTS: Record<InteractionType, number> = {
  view: 1.0,
  filter: 1.2,
  like: 2.0,
  bookmark: 2.5,
  chat: 3.0,
  rating: 4.0,
  booking: 5.0
};

const DEFAULT_BALI_HUB = {
  lat: -8.6500, // Denpasar / Canggu corridor
  lng: 115.1385
};

/**
 * Computes Haversine distance in kilometers between two coordinates.
 */
export function computeHaversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Normalizes a single criterion value to [0, 1] using min-max SAW normalization.
 * - Cost attributes (isCost = true): lower value yields higher score -> (max - val) / (max - min)
 * - Benefit attributes (isCost = false): higher value yields higher score -> (val - min) / (max - min)
 */
export function normalizeAttribute(
  value: number,
  min: number,
  max: number,
  isCost: boolean
): number {
  if (!Number.isFinite(value)) return 0;
  const span = max - min;
  if (span <= 1e-9) {
    return 1.0;
  }
  const clamped = Math.min(max, Math.max(min, value));
  if (isCost) {
    return (max - clamped) / span;
  }
  return (clamped - min) / span;
}

/**
 * Normalizes a weight vector so that sum(W_j) === 1.0 and all W_j >= 0.
 */
export function normalizeWeights(weights: RecommendationWeights): RecommendationWeights {
  const p = Math.max(0, Number(weights.price) || 0);
  const d = Math.max(0, Number(weights.distance) || 0);
  const f = Math.max(0, Number(weights.facilities) || 0);
  const r = Math.max(0, Number(weights.rating) || 0);
  const v = Math.max(0, Number(weights.verification) || 0);
  const sum = p + d + f + r + v;

  if (sum <= 1e-9) {
    return { ...DEFAULT_RECOMMENDATION_WEIGHTS };
  }

  return {
    price: p / sum,
    distance: d / sum,
    facilities: f / sum,
    rating: r / sum,
    verification: v / sum
  };
}

/**
 * Updates user criteria weights using exponential smoothing:
 * P_j' = alpha * P_j + (1 - alpha) * B_j, then normalized so sum(W_j) = 1.0.
 */
export function adaptUserWeights(
  priorWeights: RecommendationWeights,
  behaviorSignal: Partial<RecommendationWeights>,
  alpha = 0.85
): RecommendationWeights {
  const clampedAlpha = Math.min(0.99, Math.max(0.01, alpha));
  const rawUpdated: RecommendationWeights = {
    price:
      clampedAlpha * priorWeights.price +
      (1 - clampedAlpha) * (behaviorSignal.price ?? priorWeights.price),
    distance:
      clampedAlpha * priorWeights.distance +
      (1 - clampedAlpha) * (behaviorSignal.distance ?? priorWeights.distance),
    facilities:
      clampedAlpha * priorWeights.facilities +
      (1 - clampedAlpha) * (behaviorSignal.facilities ?? priorWeights.facilities),
    rating:
      clampedAlpha * priorWeights.rating +
      (1 - clampedAlpha) * (behaviorSignal.rating ?? priorWeights.rating),
    verification:
      clampedAlpha * priorWeights.verification +
      (1 - clampedAlpha) * (behaviorSignal.verification ?? priorWeights.verification)
  };
  return normalizeWeights(rawUpdated);
}

export interface RecommendableProperty {
  id: string;
  price: number;
  latitude?: string | number | null;
  longitude?: string | number | null;
  facilities?: string[];
  rating?: number | null;
  verified_water_tank?: boolean | number | null;
  verified_wifi_speedtest?: boolean | number | null;
  is_featured?: boolean | number | null;
  isFeatured?: boolean | number | null;
}

export class RecommendationService {
  private userWeights = new Map<string, RecommendationWeights>();
  private interactionLog: InteractionEvent[] = [];

  getWeightsForUser(userKey?: string): RecommendationWeights {
    if (!userKey) {
      return { ...DEFAULT_RECOMMENDATION_WEIGHTS };
    }
    const existing = this.userWeights.get(userKey);
    return existing ? { ...existing } : { ...DEFAULT_RECOMMENDATION_WEIGHTS };
  }

  recordInteraction(input: {
    userKey: string;
    propertyId: string;
    interactionType: InteractionType;
    property?: Partial<RecommendableProperty>;
    metadata?: Record<string, unknown>;
    alpha?: number;
  }): { event: InteractionEvent; updatedWeights: RecommendationWeights } {
    const prior = this.getWeightsForUser(input.userKey);
    const eventStrength = INTERACTION_SIGNAL_WEIGHTS[input.interactionType] || 1.0;
    // Scale smoothing factor by interaction intensity (stronger action = faster adaptation)
    const effectiveAlpha =
      input.alpha !== undefined
        ? input.alpha
        : Math.max(0.65, 0.90 - (eventStrength / 5.0) * 0.20);

    const signal: Partial<RecommendationWeights> = {};
    const prop = input.property;
    const meta = input.metadata || {};

    if (prop) {
      const price = Number(prop.price) || 0;
      const facCount = Array.isArray(prop.facilities) ? prop.facilities.length : 0;
      const rating = Number(prop.rating) || 0;
      const hasBadges = Boolean(prop.verified_water_tank || prop.verified_wifi_speedtest);

      // Budget properties (< 2.5M) emphasize price sensitivity
      signal.price = price > 0 && price <= 2500000 ? 0.50 : 0.20;
      signal.facilities = facCount >= 4 ? 0.40 : 0.20;
      signal.rating = rating >= 4.5 ? 0.30 : 0.15;
      signal.verification = hasBadges ? 0.25 : 0.10;
      signal.distance = 0.20;
    } else if (input.interactionType === 'filter') {
      if (meta.maxPrice !== undefined || meta.priceMax !== undefined) {
        signal.price = 0.55;
      }
      if (meta.facility !== undefined) {
        signal.facilities = 0.45;
      }
      if (meta.district !== undefined) {
        signal.distance = 0.40;
      }
    } else {
      // Generic positive reinforcement balanced across benefit & cost
      signal.price = prior.price;
      signal.distance = prior.distance;
      signal.facilities = prior.facilities + 0.05;
      signal.rating = prior.rating + 0.05;
      signal.verification = prior.verification + 0.02;
    }

    const updated = adaptUserWeights(prior, signal, effectiveAlpha);
    this.userWeights.set(input.userKey, updated);

    const event: InteractionEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userKey: input.userKey,
      propertyId: input.propertyId,
      interactionType: input.interactionType,
      metadata: input.metadata,
      timestamp: new Date().toISOString()
    };

    this.interactionLog.push(event);
    if (this.interactionLog.length > 1000) {
      this.interactionLog.shift();
    }

    return { event, updatedWeights: updated };
  }

  rankProperties<T extends RecommendableProperty>(
    properties: T[],
    options?: {
      userKey?: string;
      weights?: RecommendationWeights;
      targetLat?: number;
      targetLng?: number;
      limit?: number;
    }
  ): (T & { suitabilityScore: number })[] {
    if (properties.length === 0) return [];

    const weights = normalizeWeights(
      options?.weights || this.getWeightsForUser(options?.userKey)
    );
    const refLat =
      options?.targetLat !== undefined && Number.isFinite(options.targetLat)
        ? options.targetLat
        : DEFAULT_BALI_HUB.lat;
    const refLng =
      options?.targetLng !== undefined && Number.isFinite(options.targetLng)
        ? options.targetLng
        : DEFAULT_BALI_HUB.lng;

    const metrics = properties.map((p) => {
      const price = Number(p.price) || 0;
      const lat = parseFloat(String(p.latitude || DEFAULT_BALI_HUB.lat));
      const lng = parseFloat(String(p.longitude || DEFAULT_BALI_HUB.lng));
      const distanceKm = computeHaversineDistanceKm(
        refLat,
        refLng,
        Number.isFinite(lat) ? lat : DEFAULT_BALI_HUB.lat,
        Number.isFinite(lng) ? lng : DEFAULT_BALI_HUB.lng
      );
      const facilitiesCount = Array.isArray(p.facilities) ? p.facilities.length : 0;
      const rating = Number(p.rating) || 0;
      const verificationScore =
        (p.verified_water_tank ? 0.5 : 0) + (p.verified_wifi_speedtest ? 0.5 : 0);

      return {
        property: p,
        price,
        distanceKm,
        facilitiesCount,
        rating,
        verificationScore
      };
    });

    const prices = metrics.map((m) => m.price);
    const distances = metrics.map((m) => m.distanceKm);
    const facCounts = metrics.map((m) => m.facilitiesCount);
    const ratings = metrics.map((m) => m.rating);

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const minDist = Math.min(...distances);
    const maxDist = Math.max(...distances);
    const minFac = Math.min(...facCounts);
    const maxFac = Math.max(...facCounts);
    const minRating = Math.min(...ratings);
    const maxRating = Math.max(...ratings);

    const scored = metrics.map((m) => {
      const sPrice = normalizeAttribute(m.price, minPrice, maxPrice, true);
      const sDistance = normalizeAttribute(m.distanceKm, minDist, maxDist, true);
      const sFacilities = normalizeAttribute(m.facilitiesCount, minFac, maxFac, false);
      const sRating = normalizeAttribute(m.rating, minRating, maxRating, false);
      const sVerification = m.verificationScore; // Already in [0, 1]

      const baseScore =
        weights.price * sPrice +
        weights.distance * sDistance +
        weights.facilities * sFacilities +
        weights.rating * sRating +
        weights.verification * sVerification;

      const isFeaturedActive = Boolean(m.property.is_featured || m.property.isFeatured);
      const finalScore = Math.min(1.0, Number((baseScore + (isFeaturedActive ? 0.03 : 0)).toFixed(4)));

      return {
        ...m.property,
        suitabilityScore: finalScore
      };
    });

    scored.sort((a, b) => b.suitabilityScore - a.suitabilityScore);

    if (options?.limit && options.limit > 0) {
      return scored.slice(0, options.limit);
    }
    return scored;
  }
}

export const recommendationService = new RecommendationService();
