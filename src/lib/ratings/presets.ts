import SOS_CONTENT from "../../../SOS.js?raw"

export type RatingPreset = {
  id: string
  name: string
  description: string
  content: string
}

export const RATING_PRESETS: RatingPreset[] = [
  {
    id: "sos",
    name: "Secrets of Strixhaven",
    description: "Community ratings for the SOS expansion",
    content: SOS_CONTENT,
  },
]
