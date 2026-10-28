import type {FlavorFeedback} from "@/domain";
import {feedbackRatingLabel} from "@/domain";
import "./brew-rating.css";
export function BrewRating({feedback,delta}:{feedback?:FlavorFeedback|null;delta?:number}){
  const label=feedbackRatingLabel(feedback);if(!label)return null;
  return <span className="brew-rating"><span aria-label={feedback?.stars===undefined?undefined:`${feedback.stars} 顆星`}>{label}</span>{delta!==undefined&&delta!==0&&<span className={delta>0?"rating-up":"rating-down"} aria-label={`比同豆子上一杯${delta>0?"高":"低"} ${Math.abs(delta)} 顆星`}>{delta>0?"↑":"↓"}</span>}</span>;
}
