/** A small, deterministic match analyst. Every claim has recorded evidence. */
import {BOARD_WIDTH as W,BOARD_HEIGHT as H,BOX_FILES,BOX_DEPTH} from './engine.js?v=bc58e8823cbc';
import {createMatchStats,matchStatsSummary} from './match-stats.js?v=3310fe94a6e9';

const TEAMS=['white','black'],NAME={white:'Ivory',black:'Obsidian'};
const other=team=>team==='white'?'black':'white';
const sideOf=id=>/^(white|black)-/.exec(id||'')?.[1]||null;
const number=n=>Number.isFinite(n)&&n>=0;
const goalFrame=frame=>frame.action?.type==='goal'&&[-1,H].includes(frame.ball.y);
const homeDepth=(team,point)=>team==='white'?H-1-point.y:point.y;
const central=p=>Math.abs(p.x-(W-1)/2)<=2.5;
const goalTarget=a=>a?.goalTarget||a?.targetOptions?.[0]||a?.to;
const opponentShot=(a,team)=>goalTarget(a)?.y===(team==='white'?-1:H);
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;

export function recordedGoalIndices(replay){return replay.frames.flatMap((frame,i)=>goalFrame(frame)?[i]:[]);}
export function recordedGoalClip(replay,index){
  if(!Number.isInteger(index)||index<1||!goalFrame(replay.frames[index]))return null;
  const final=replay.frames[index],a=final.action;
  let start=Math.max(0,index-11);
  while(start<index&&(replay.frames[start].score.white!==replay.frames[index-1].score.white||replay.frames[start].score.black!==replay.frames[index-1].score.black))start++;
  if(start===index)return null;
  return {kind:'goal',frames:replay.frames.slice(start,index+1),score:final.score,team:a.team,shootingTeam:a.shootingTeam||sideOf(a.pieceId),ownGoal:sideOf(a.pieceId)!==a.team,shooterId:a.pieceId};
}

/** Reconstruct only what an old position-only file actually contains. */
function observations(replay){
  const raw=createMatchStats({partial:replay.partial||replay.capped,baselineScore:replay.frames[0].score});
  const extra=Object.fromEntries(TEAMS.map(team=>[team,{xG:0,resolved:0,unknownXG:0,goals:0,boxShots:0,longShots:0,saves:0,
    defendSamples:0,highLine:0,highStreak:0,longestHigh:0,behindShots:0,behindGoals:0}]));
  let pending=null,pendingCorner=null,restart=true,crowded=0,samples=0,sampleSerial=0;
  const goals=[],shots=[];
  for(let index=1;index<replay.frames.length;index++){
    const frame=replay.frames[index],before=replay.frames[index-1],a=frame.action;
    if(!a)continue;
    if(a.type==='shotAttempt'){
      const team=a.shootingTeam||sideOf(a.pieceId)||a.team;
      if(TEAMS.includes(team)){
        pending={team,attacking:opponentShot(a,team),from:a.from,action:a};
        if(pending.attacking)raw.teams[team].shots++;
      }
      restart=false;
    }
    if(['goal','save','shotMiss','blockedShot'].includes(a.type)&&(!['goal'].includes(a.type)||goalFrame(frame))){
      const team=pending?.team||a.shootingTeam||sideOf(a.shooterId||a.pieceId);
      if(TEAMS.includes(team)&&(pending?.attacking??opponentShot(a,team))){
        if(!pending)raw.teams[team].shots++;
        const data=extra[team],origin=pending?.from||a.from;
        data.resolved++;
        const probability=a.disguised&&number(a.combinedProbability)?a.combinedProbability:a.probability;
        if(number(probability)&&probability<=1)data.xG+=probability;else data.unknownXG++;
        if(['goal','save'].includes(a.type))raw.teams[team].onTarget++;
        if(a.type==='save')extra[other(team)].saves++;
        if(origin){
          const depth=team==='white'?origin.y:H-1-origin.y;
          if(BOX_FILES.includes(origin.x)&&depth<BOX_DEPTH)data.boxShots++;
          if(depth>=BOX_DEPTH+3)data.longShots++;
          const defenders=before.pieces.filter(p=>p.team===other(team)&&p.type!=='K');
          if(defenders.length&&homeDepth(other(team),origin)<Math.min(...defenders.map(p=>homeDepth(other(team),p)))){
            extra[other(team)].behindShots++;if(a.type==='goal')extra[other(team)].behindGoals++;
          }
        }
        shots.push({index,team,type:a.type,probability:probability??null,origin});
      }
      if(a.outcome==='corner'){
        const cornerTeam=pending?.team||a.shootingTeam||sideOf(a.pieceId);
        if(TEAMS.includes(cornerTeam)){raw.teams[cornerTeam].corners++;pendingCorner=cornerTeam;}
      }
      pending=null;restart=true;
    }
    if(goalFrame(frame)){
      const ownGoal=sideOf(a.pieceId)!==a.team;
      goals.push({index,team:a.team,score:frame.score,scorerId:a.pieceId,ownGoal});extra[a.team].goals++;
      raw.goals.push({team:a.team,scorerId:a.pieceId,assistId:null,ownGoal,turn:0,recordedStep:index,matchSeconds:null,origin:a.from||null,target:a.goalTarget||a.to,distance:null});
    }
    if(a.type==='foul'&&TEAMS.includes(a.team)){
      const record=raw.teams[a.team];record.fouls++;
      if(a.card==='yellow'||a.secondYellow)record.yellowCards++;
      if(a.card==='red')record.redCards++;
      raw.foulEvents.push({team:a.team,offenderId:a.offenderId,fouledId:a.targetId,card:a.card,secondYellow:!!a.secondYellow,turn:0,matchSeconds:null});
    }
    if(a.type==='cornerTaker'&&TEAMS.includes(a.team)){
      if(pendingCorner!==a.team)raw.teams[a.team].corners++;
      pendingCorner=a.team;
    }
    if(['foul','out','offside','stalling','timeout','cornerTaker'].includes(a.type))restart=true;
    if(a.type==='kick'){restart=false;pendingCorner=null;}
    // Sample one in four open-play movements to reduce subaction weighting.
    // These are positions, not possession time or inferred tactical intentions.
    const carrier=frame.pieces.find(p=>p.id===frame.ball.carrierId);
    if(!restart&&a.type==='move'&&carrier&&carrier.type!=='K'&&++sampleSerial%4===0){
      samples++;
      const players=frame.pieces.filter(p=>p.type!=='K');
      const middle=players.filter(p=>central(p)&&Math.abs(p.y-(H-1)/2)<=2);
      if(middle.length>=8&&TEAMS.every(team=>middle.filter(p=>p.team===team).length>=3))crowded++;
      const team=other(carrier.team),side=players.filter(p=>p.team===team),data=extra[team];data.defendSamples++;
      const back=Math.min(...side.map(p=>homeDepth(team,p))),line=side.filter(p=>homeDepth(team,p)<=back+2);
      const high=side.length>=6&&back>=Math.floor((H-1)/2)-2&&line.length>=3&&Math.max(...line.map(p=>p.x))-Math.min(...line.map(p=>p.x))>=4;
      if(high){data.highLine++;data.highStreak++;data.longestHigh=Math.max(data.longestHigh,data.highStreak);}else data.highStreak=0;
    }
  }
  return {raw,extra,goals,shots,samples,crowded};
}

export function analyseMatch(replay){
  if(!replay?.frames?.length)return null;
  const seen=observations(replay),original=replay.statistics,raw=original||seen.raw,summary=matchStatsSummary(raw);
  const completeStats=original?!original.partial:!replay.partial&&!replay.capped;
  const xG=Object.fromEntries(TEAMS.map(team=>{
    const players=original&&Object.values(original.playerRatings?.players||{}).filter(p=>p.team===team);
    const saved=players?.length&&!original.playerRatings.partial?players.reduce((total,p)=>total+(number(p.counts?.xG)?p.counts.xG:0),0):null;
    return [team,saved!==null?saved:seen.extra[team].unknownXG?null:seen.extra[team].xG];
  }));
  const chanceComplete=TEAMS.every(team=>xG[team]!==null)&&completeStats&&(!replay.partial&&!replay.capped||original&&!original.playerRatings.partial);
  const final=replay.frames.at(-1),forfeited=TEAMS.find(team=>final.pieces.filter(p=>p.team===team).length<7);
  const winner=forfeited?other(forfeited):replay.score.white===replay.score.black?null:replay.score.white>replay.score.black?'white':'black';
  const score=`${replay.score.white}–${replay.score.black}`,paragraphs=[],evidence=[],candidates=[];
  let headline=replay.finished?(forfeited?`${NAME[winner]} win by forfeit`:winner?`${NAME[winner]} take the match`:'Nothing between the sides'):'The match so far';
  if(replay.capped)headline='Analysis of the recorded portion';
  paragraphs.push(forfeited?`${NAME[forfeited]} fell below seven players; ${NAME[winner]} won by forfeit with the score at ${score}.`
    :replay.finished?winner?`${NAME[winner]} won ${replay.score[winner]}–${replay.score[other(winner)]}.`:`The match ended level at ${score}.`
    :`Ivory ${replay.score.white}–${replay.score.black} Obsidian at the saved position; this is an in-progress report.`);
  const w=summary.teams.white,b=summary.teams.black,totalShots=w.shots+b.shots;
  if(totalShots){
    let chances=`${completeStats?'':'In the available statistics, '}Ivory took ${plural(w.shots,'shot')} (${w.onTarget} on target), against ${b.shots} (${b.onTarget} on target) for Obsidian.`;
    if(chanceComplete){
      chances+=` Recorded xG was ${xG.white.toFixed(2)}–${xG.black.toFixed(2)}.`;
      if(winner&&Math.abs(xG.white-xG.black)>=.6&&xG[winner]<xG[other(winner)])chances+=` The ${replay.finished?'winner':'leading side'} converted a smaller total of expected chances; the score alone does not show chance dominance.`;
      else if(winner&&xG[winner]-xG[other(winner)]>=.8)chances+=` The stronger chance total supports ${NAME[winner]}'s ${replay.finished?'result':'lead'}.`;
      else if(winner&&Math.abs(replay.score.white-replay.score.black)>=3&&Math.abs(xG.white-xG.black)<.6)chances+=' The large score gap was not matched by a similarly large xG gap.';
    }
    paragraphs.push(chances);
  }else paragraphs.push(completeStats?'Neither side recorded a shot. There is too little attacking evidence to judge finishing.':'No shots appear in the available segment; earlier attacks cannot be assessed.');
  for(const team of TEAMS){
    const data=seen.extra[team],name=NAME[team],defended=data.defendSamples;
    const possession=summary.teams[team].possessionPercent;
    if(chanceComplete&&possession>=60&&xG[other(team)]-xG[team]>=.7)candidates.push({rank:85,text:`${name} had ${Math.round(possession)}% of recorded active possession but produced ${xG[team].toFixed(2)} xG against ${xG[other(team)].toFixed(2)}. Their larger share of the ball did not translate into the stronger chances.`});
    if(defended>=12&&data.highLine/defended>=.5&&data.longestHigh>=3){
      candidates.push({rank:80+data.behindGoals,text:`${name} held a high line in ${data.highLine} of ${defended} sampled defending positions.${data.behindShots?` They also allowed ${plural(data.behindShots,'shot')} from behind their deepest outfield player${data.behindGoals?`, including ${plural(data.behindGoals,'goal')}`:''}.`:' That left space between the outfield line and their own goal.'} Keeping one more player deep is worth testing.`});
    }
    if(!data.unknownXG&&data.resolved>=5&&data.longShots/data.resolved>=.65&&data.xG/data.resolved<.18){
      candidates.push({rank:65,text:`${name} relied on shots from further out (${data.longShots} of ${data.resolved} resolved attempts in the recording), averaging ${(data.xG/data.resolved).toFixed(2)} xG. Receiving closer to goal could improve the quality of their chances.`});
    }
    if(summary.teams[team].redCards)candidates.push({rank:95,text:`${name} received ${plural(summary.teams[team].redCards,'red card')}. The dismissals reduced their available players${forfeited===team?' and ended the match':''}; the record does not isolate their effect on the score.`});
    evidence.push(`${name}: high line in ${data.highLine}/${defended} sampled defending positions; ${data.behindShots} recorded shots conceded from behind the deepest outfield player.`);
  }
  if(seen.samples>=20&&seen.crowded/seen.samples>=.4)candidates.push({rank:75,text:`Midfield was crowded in ${seen.crowded} of ${seen.samples} sampled positions: at least eight outfield pieces occupied the central area, with three or more from each side. Wider receiving options could help avoid that traffic.`});
  const scorer=summary.scorers.find(s=>s.count>=2);
  if(scorer)candidates.push({rank:55,text:`${NAME[scorer.team]}'s ${scorer.pieceId.split('-')[1]} scored ${scorer.count} goals, providing a repeated finishing outlet.`});
  const assists=summary.assists.find(s=>s.count>=2);
  if(assists)candidates.push({rank:58,text:`${NAME[assists.team]}'s ${assists.pieceId.split('-')[1]} supplied ${assists.count} assists and was a recurring source of the final pass.`});
  const selected=candidates.sort((a,b)=>b.rank-a.rank).slice(0,2);
  paragraphs.push(...selected.map(item=>item.text));
  if(!selected.length&&totalShots>=3)paragraphs.push('The recorded positions do not establish a sustained high line or crowded midfield pattern. Use the goal replays to inspect how the chances developed.');
  const coverage=[replay.partial?'Positional analysis covers only the available recording; earlier play is missing.':replay.capped?'The recording reached its limit; later play is missing.':'Positional analysis covers the saved play.',
    original?(original.partial?'The saved match statistics are partial.':'Original match statistics are included.'):'Statistics are reconstructed from recorded events. Possession time, assists, ratings and timed heatmaps were not saved in this older file.'].join(' ');
  evidence.push(`Crowded midfield: ${seen.crowded}/${seen.samples} sampled positions. Samples count positions, not elapsed time.`,
    'xG uses recorded scoring probabilities after keeper decisions; disguised shots use the recorded combined probability. xG describes chance quality, not proof of luck or a cause of defeat.');
  return {headline,paragraphs,coverage,evidence,raw,summary,xG,original:!!original,seen,game:{...final,phase:replay.finished?'finished':'playing',lastAction:final.action},finished:replay.finished};
}

export function renderMatchAnalysis(container,report){
  container.replaceChildren();if(!report)return;
  const doc=container.ownerDocument,add=(tag,text,parent=container)=>{const el=doc.createElement(tag);el.textContent=text;parent.append(el);return el;};
  add('p','MATCH ANALYSIS').className='eyebrow';add('h3',report.headline);
  report.paragraphs.forEach(text=>add('p',text));
  const detail=add('details','');add('summary','What this analysis uses',detail);
  add('p','Generated locally from recorded events and positions. Suggestions are interpretations, not a re-simulation of the match.',detail);
  add('p',report.coverage,detail);report.evidence.forEach(text=>add('p',text,detail));
}
