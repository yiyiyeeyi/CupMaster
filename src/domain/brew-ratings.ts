import type {Brew} from "./types";
import {beanBrews,beanDisplayName,beanIdentity,type BeanRecord} from "./beans";
export function bestStars(brews:readonly Brew[]){
  const values=brews.filter(brew=>brew.executionStatus==="completed").flatMap(brew=>brew.flavorFeedback?.stars===undefined?[]:[brew.flavorFeedback.stars]);
  return values.length?Math.max(...values):undefined;
}
function identity(brew:Brew){return beanIdentity(brew.recordDetails?.bean?.name??brew.recipeSnapshot.bean?.name,brew.recordDetails?.bean?.roaster??brew.recipeSnapshot.bean?.roaster);}
export function previousRatingDelta(brew:Brew,brews:readonly Brew[],beans:readonly BeanRecord[]=[]){
  if(brew.flavorFeedback?.stars===undefined)return undefined;
  const key=identity(brew),matches=brew.beanId?beans.filter(bean=>!bean.deletedAt&&bean.id===brew.beanId):key?beans.filter(bean=>!bean.deletedAt&&(beanIdentity(beanDisplayName(bean),bean.roaster)===key||bean.legacyKeys?.includes(key))):[];
  if(matches.length>1)return undefined;
  const related=matches.length===1?beanBrews(matches[0],beans,brews):brew.beanId?brews.filter(other=>other.beanId===brew.beanId):key?brews.filter(other=>!other.beanId&&identity(other)===key):[];
  const ordered=related.filter(other=>other.executionStatus==="completed"&&!other.legacyPreparationId).sort((a,b)=>(b.completedAt??b.createdAt).localeCompare(a.completedAt??a.createdAt)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
  const index=ordered.findIndex(other=>other.id===brew.id),previous=index<0?undefined:ordered[index+1]?.flavorFeedback?.stars;
  return previous===undefined?undefined:brew.flavorFeedback.stars-previous;
}
