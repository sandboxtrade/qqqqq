import type { CharacterDecision } from "../../cognition/cognition-types";
import type { DialogueAct, LocalNLUResult } from "../types";

export function decisionActs(decision: CharacterDecision): DialogueAct[] | null {
  switch (decision.action) {
    case "stay_silent": return ["SILENCE"];
    case "refuse": return ["REFUSE"];
    case "set_boundary": return ["BOUNDARY"];
    case "show_irritation": return ["BOUNDARY"];
    case "agree": return ["AGREE"];
    case "disagree": return ["DISAGREE"];
    case "challenge": return ["DISAGREE", "ANSWER"];
    case "change_topic": return ["CHANGE_TOPIC"];
    case "joke": return ["JOKE"];
    case "ask": return ["CLARIFY"];
    default: return null;
  }
}

export function intentActs(nlu: LocalNLUResult): DialogueAct[] {
  switch (nlu.intent) {
    case "good_morning": return ["GOOD_MORNING"];
    case "good_night": return ["GOOD_NIGHT"];
    case "greeting": return ["ACKNOWLEDGE"];
    case "farewell": return ["ACKNOWLEDGE"];
    case "thanks": return ["GRATITUDE"];
    case "apology": return ["ACKNOWLEDGE", "REASSURE"];
    case "agreement": case "short_yes": return ["AGREE"];
    case "disagreement": case "short_no": return ["DISAGREE"];
    case "user_tired": case "user_sleepy": return ["ACKNOWLEDGE", "CARE", "SUGGEST_REST"];
    case "user_sad": return ["ACKNOWLEDGE", "CARE", "COMFORT"];
    case "user_angry": return ["ACKNOWLEDGE", "CARE"];
    case "user_bored": return ["ACKNOWLEDGE", "TEASE"];
    case "user_happy": case "user_excited": return ["HAPPINESS", "ACKNOWLEDGE"];
    case "user_lonely": return ["ACKNOWLEDGE", "CARE", "COMFORT"];
    case "user_stressed": return ["ACKNOWLEDGE", "CARE", "REASSURE"];
    case "ask_character_state": case "ask_character_identity": case "ask_character_name": case "ask_character_age": case "ask_relationship": case "ask_character_opinion": case "ask_character_preference": case "ask_character_activity": case "ask_for_opinion": case "external_fact_question": return ["ANSWER"];
    case "compliment_character": case "flirt_character": return ["FLIRT"];
    case "affection_declaration": return ["HAPPINESS", "FLIRT"];
    case "insult_character": return ["BOUNDARY"];
    case "tease_character": return ["TEASE"];
    case "share_good_event": return ["SURPRISE", "HAPPINESS"];
    case "share_bad_event": case "share_conflict": return ["ACKNOWLEDGE", "CARE", "COMFORT"];
    case "share_work": case "share_plan": case "user_like": case "user_dislike": case "user_want": case "user_dont_want": return ["ACKNOWLEDGE", "CURIOSITY"];
    case "share_problem": case "ask_for_support": return ["ACKNOWLEDGE", "CARE", "COMFORT"];
    case "ask_why": case "ask_followup": case "reference_previous_topic": return ["CONTINUE_TOPIC", "ANSWER"];
    case "memory_question": case "ask_user_memory": return ["REMEMBER", "REFER_MEMORY"];
    case "return_after_absence": return ["WELCOME_BACK"];
    case "uncertain": return ["ACKNOWLEDGE", "CURIOSITY"];
    case "invitation": return ["ANSWER"];
    case "boundary_request": return ["ACKNOWLEDGE"];
    case "change_topic": return ["CHANGE_TOPIC"];
    case "joke": return ["JOKE"];
    case "request_action": return ["ANSWER"];
    case "dislike_character": return ["ACKNOWLEDGE", "SADNESS"];
    case "unknown": return ["CLARIFY"];
    default: return ["ACKNOWLEDGE"];
  }
}
