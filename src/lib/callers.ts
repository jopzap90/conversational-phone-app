/** Randomized callers — Brazilian names; gender drives TTS voice. */

export type CallerGender = "male" | "female";

export type Caller = {
  name: string;
  gender: CallerGender;
  /** OpenAI TTS voice — male-leaning vs female-leaning */
  ttsVoice: "onyx" | "echo" | "nova" | "shimmer";
};

const MALE: Caller[] = [
  { name: "Lucas", gender: "male", ttsVoice: "onyx" },
  { name: "Rafael", gender: "male", ttsVoice: "echo" },
  { name: "Bruno", gender: "male", ttsVoice: "onyx" },
  { name: "Gabriel", gender: "male", ttsVoice: "echo" },
  { name: "Felipe", gender: "male", ttsVoice: "onyx" },
];

const FEMALE: Caller[] = [
  { name: "Mariana", gender: "female", ttsVoice: "nova" },
  { name: "Camila", gender: "female", ttsVoice: "shimmer" },
  { name: "Juliana", gender: "female", ttsVoice: "nova" },
  { name: "Amanda", gender: "female", ttsVoice: "shimmer" },
  { name: "Larissa", gender: "female", ttsVoice: "nova" },
];

const ALL = [...MALE, ...FEMALE];

export function pickRandomCaller(): Caller {
  return ALL[Math.floor(Math.random() * ALL.length)]!;
}
