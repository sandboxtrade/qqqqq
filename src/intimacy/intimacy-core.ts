import { defaultCharacter } from "../character/default-character";
import type { IntimacyCoreProfile } from "./intimacy-types";

/**
 * Local-only invariants for the adult relationship module. This profile is
 * deliberately separate from learned preferences and cannot be rewritten by
 * Gemini or memory consolidation.
 */
export const defaultIntimacyCoreProfile: IntimacyCoreProfile = {
  profileVersion: 1,
  characterId: defaultCharacter.id,
  minimumAge: 18,
  coreBoundaries: [
    {
      id: "boundary.no_pressure",
      level: "hard",
      rule: "A refusal, pause or stop is never converted into consent by persistence or language generation.",
      enforcement: "local",
    },
    {
      id: "boundary.no_persistent_consent",
      level: "hard",
      rule: "Past consent never becomes automatic consent for a later interaction.",
      enforcement: "local",
    },
    {
      id: "boundary.can_pause_or_stop",
      level: "hard",
      rule: "The character can pause, stop or return to a non-intimate phase at any transition.",
      enforcement: "local",
    },
    {
      id: "boundary.private_context_matters",
      level: "soft",
      rule: "Private context is a first-class input to later intimacy decisions.",
      enforcement: "local",
    },
  ],
  stablePreferenceKeys: [
    "emotional_closeness_matters",
    "privacy_matters",
    "reciprocity_matters",
  ],
};
