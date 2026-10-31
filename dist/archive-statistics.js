import {restoreMatchStats} from './match-stats.js?v=55c61804a722';
const TEAMS=['white','black'];
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000;

/** Optional original statistics, separate from positions reconstructed for playback. */
export function restoreArchiveStatistics(value,frame){
  try{
    if(!value||value.version!==2||!frame||JSON.stringify(value).length>2500000
      ||!Array.isArray(value.goals)||value.goals.length>20000
      ||!Array.isArray(value.foulEvents)||value.foulEvents.length>20000
      ||!TEAMS.every(team=>count(value.baselineScore?.[team])
        &&['shots','onTarget','corners','fouls','yellowCards','redCards'].every(key=>count(value.teams?.[team]?.[key]))
        &&Number.isFinite(value.teams[team].possessionMs)&&value.teams[team].possessionMs>=0&&value.teams[team].possessionMs<=31536000000
        &&value.baselineScore[team]+value.goals.filter(goal=>goal?.team===team).length===frame.score[team]))return null;
    const game={...frame,phase:'finished',lastAction:frame.action,attack:'white'};
    const result=restoreMatchStats(value,game,{partial:true});
    if(result.goals.length!==value.goals.length||result.foulEvents.length!==value.foulEvents.length
      ||!TEAMS.every(team=>['shots','onTarget','corners','possessionMs','fouls','yellowCards','redCards'].every(key=>result.teams[team][key]===value.teams[team][key])))return null;
    return result;
  }catch{return null;}
}
