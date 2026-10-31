import {BOARD_WIDTH,BOARD_HEIGHT,currentTeam} from './engine.js?v=eb0ab0924c73';

export const inExerciseZone=(p,z)=>!!p&&!!z&&p.x>=z.x0&&p.x<=z.x1&&p.y>=z.y0&&p.y<=z.y1;
export function normalizeMidfieldGoal(source){
  const z=source.zone,n=source.secureReplies;
  if(!['switch','protect'].includes(source.kind)||!z||!['x0','x1','y0','y1'].every(k=>Number.isInteger(z[k]))
      ||z.x0<0||z.x1>=BOARD_WIDTH||z.y0<0||z.y1>=BOARD_HEIGHT||z.x0>z.x1||z.y0>z.y1
      ||!Number.isInteger(n)||n<1||n>3||source.kind==='switch'&&n!==1)throw new RangeError('Choose a valid midfield target area and defensive reply count.');
  return {...source,type:'possession',grading:'outcome',zone:{...z}};
}
export function midfieldGoalText(goal){
  const z=goal.zone,files='abcdefghijklmn',area=`${files[z.x0]}${BOARD_HEIGHT-z.y1}–${files[z.x1]}${BOARD_HEIGHT-z.y0}`;
  return goal.kind==='switch'
    ?`Switch the ball into the marked far-side area (${area}) and keep it with an outfield player through a full defensive reply. Any legal route counts; no shot is needed.`
    :`Keep outfield possession inside the marked midfield area (${area}) through ${goal.secureReplies} consecutive clean defensive replies. You may pass, carry or use supporting moves. No shot is needed.`;
}

/** Count complete native defensive phases, never individual moves or bonuses.
 * A loose pass must be collected; a lucky knight evasion earns no safe reply.
 * Losing possession, a restart, or leaving the zone resets the current streak.
 */
export function updateMidfieldProgress(session,before,after){
  const goal=session.definition.goal;if(goal.type!=='possession')return false;
  const p=session.progress,team=session.playerTeam,a=after.lastAction||{};
  const controlled=after.pieces.find(piece=>piece.id===after.ball.carrierId);
  const reset=after.attack!==team||!!after.restart||!inExerciseZone(after.ball,goal.zone)
    ||controlled&&(controlled.team!==team||controlled.type==='K');
  if(reset)p.securedReplies=0;
  if(before.phase!=='defendMove'&&after.phase==='defendMove')p.midfieldReplyExposed=false;
  if(a.type==='tackleMiss'&&before.attack===team&&currentTeam(before)!==team)p.midfieldReplyExposed=true;
  const complete=before.phase==='defendMove'&&before.attack===team
    &&after.phase==='kick'&&after.attack===team&&currentTeam(after)===team;
  if(complete){
    if(!reset&&controlled&&controlled.team===team&&!p.midfieldReplyExposed)p.securedReplies++;
    else p.securedReplies=0;
    p.midfieldReplyExposed=false;
  }
  return complete&&p.securedReplies>=goal.secureReplies;
}
