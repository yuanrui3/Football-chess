/** Curated reduced Football Chess studies. Unused players are deliberately omitted.
 * Example actions document one native route against the deterministic Tactical
 * bot; session grading evaluates the objective, never this move list.
 */
import {createGame,applyKick} from './engine.js?v=bc58e8823cbc';
import {MEDIUM_EXERCISES} from './exercise-medium.js?v=058ae5d6ae6e';
import {TOUGH_ATTACK_EXERCISES} from './exercise-tough-attack.js?v=29b11d9a3e19';
import {TOUGH_MIXED_EXERCISES} from './exercise-tough-mixed.js?v=c7478b669f7b';
import {TOUGH_DEFENCE_EXTRA} from './exercise-tough-defence-extra.js?v=b5c068a8f4ca';

const piece=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
const base=({keeper=[6,0],defender=[12,3]}={})=>[
  piece('white-K',6,16),piece('black-K',...keeper),
  piece('black-R1',...defender),piece('black-B1',13,8),
];
const move=(pieceId,x,y,freePawn=false)=>({type:'move',pieceId,x,y,...(freePawn?{freePawn:true}:{})});
const kick=(x,y,disguise=false)=>({type:'kick',x,y,...(disguise?{disguise:true}:{})});
const skip=()=>({type:'skip'});
const finish=(minShotXG,requires=null,boxEntryMode='pass')=>({type:'finish',minShotXG,requires,boxEntryMode});
const defend=maxOpponentShotXG=>({type:'defend',maxOpponentShotXG});
const position=(pieces,carrierId,phase='kick',attack='white',shot)=>({pieces,carrierId,phase,attack,...(shot?{shot}:{})});
const definitions=[
  {
    id:'pick-the-open-file',title:'Take the central finish',revision:2,theme:'one-on-one',side:'attack',playerTeam:'white',roundLimit:3,
    objective:'Create and take any legal finish worth at least 25% against the best keeper reply.',
    coachNote:'The keeper starts centrally on g17. A close central shot is a useful chance even against proper goalkeeping; it is not an empty-net finish. The ordinary shot, rather than a favourable sampled goal, meets this outcome.',
    hints:['The keeper is in a normal central position.','The queen already has a close legal shot; another pass is not compulsory.','From g15, the direct G-goal shot is worth about 26% against the best keeper reaction.'],
    goal:finish(.25),
    position:position([...base({defender:[13,1]}),piece('white-Q',6,2)],'white-Q'),
    exampleActions:[kick(6,-1)],
  },
  {
    id:'knights-two-posts',title:'The knight has two posts',revision:2,theme:'one-on-one',side:'attack',playerTeam:'white',roundLimit:3,
    objective:'Create and take any legal finish worth at least 45% after the best keeper reply.',
    coachNote:'A central keeper still has to react to the knight’s L-shaped target. Both reachable posts offer a useful finish here, and a legal disguise is another option. No particular target is required.',
    hints:['The knight does not shoot straight ahead.','Look one file across and two ranks toward the net.','From g16, F and H are legal L-shaped targets. Compare both against the central keeper or try the two-target disguise.'],
    goal:finish(.45),
    position:position([...base({defender:[13,1]}),piece('white-N1',6,1)],'white-N1'),
    exampleActions:[kick(5,-1)],
  },
  {
    id:'queen-two-targets',title:'Keep the goalkeeper guessing',theme:'one-on-one',side:'attack',playerTeam:'white',roundLimit:3,
    objective:'Create a finish worth at least 35%; more than one target or shooting choice can succeed.',
    coachNote:'The queen reaches two goal targets against a central keeper. Disguise makes the keeper respond before the actual target is chosen. Either sufficiently strong direct aim also counts.',
    hints:['The queen has a straight target and a diagonal target.','The keeper can react to a single declared aim, but a disguised shot shows two possibilities.','From g16, G and I are legal targets. The disguised pair is a strong way to use both.'],
    goal:finish(.35),
    position:position([...base({keeper:[7,0],defender:[13,1]}),piece('white-Q',6,1)],'white-Q'),
    exampleActions:[kick(6,-1,true)],
  },
  {
    id:'release-the-knight',title:'Release the knight beyond the line',revision:2,theme:'through-ball',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take any legal finish worth at least 20% against the best keeper reply.',
    coachNote:'The keeper begins centrally. A forward delivery into h15 lets the onside knight collect and continue toward j16, far enough from the keeper to avoid an immediate challenge. The resulting 23% chance is useful against a properly positioned defence; the through ball is one possible route.',
    hints:['The keeper can challenge a receiver that stops too close to it.','A ball to h15 lets the knight make a separate onward dribble toward the far side.','One plan is Bd11–h15, Nf14–h15 to collect, then Nj16 and an I-goal shot.'],
    goal:finish(.20,'through-ball'),
    position:position([...base({defender:[4,3]}),piece('white-B1',3,6),piece('white-N1',5,3)],'white-B1'),
    exampleActions:[kick(7,2),move('white-N1',7,2),move('white-N1',9,1),skip(),kick(8,-1)],
  },
  {
    id:'diagonal-pocket',title:'Find the diagonal pocket',revision:2,theme:'through-ball',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take any legal finish worth at least 20% against the best keeper reply.',
    coachNote:'The pass can go to empty space ahead of an onside knight. After collecting, continuing to j16 creates separation from the central goalkeeper; stopping on the nearer side gives it a challenge. Any legal plan reaching the chance target earns credit.',
    hints:['The knight is level with the second-last defender at release.','The empty h15 square lies on the queen’s diagonal and one knight jump away.','One route is Qf13–h15, Nf14–h15 to collect, then Nj16 and the I-goal finish.'],
    goal:finish(.20,'through-ball'),
    position:position([...base({defender:[4,3]}),piece('white-Q',5,4),piece('white-N1',5,3)],'white-Q'),
    exampleActions:[kick(7,2),move('white-N1',7,2),move('white-N1',9,1),skip(),kick(8,-1)],
  },
  {
    id:'pass-down-the-channel',title:'Pass down the channel',revision:2,theme:'through-ball',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take any legal finish worth at least 20% against the best keeper reply.',
    coachNote:'A through ball can follow a rook’s file. The knight collects beyond the defensive line and changes direction toward j16. The keeper starts centrally and gets its full reply, so separation from its tackling reach matters.',
    hints:['The rook can send a forward ball down the h-file.','An onside knight can reach h15, then use its separate dribble.','One plan is Rh11–h15, Nf14–h15 to collect, then Nj16 and an I-goal shot.'],
    goal:finish(.20,'through-ball'),
    position:position([...base({defender:[6,3]}),piece('white-R1',7,6),piece('white-N1',5,3)],'white-R1'),
    exampleActions:[kick(7,2),move('white-N1',7,2),move('white-N1',9,1),skip(),kick(8,-1)],
  },
  {
    id:'diagonal-delivery',title:'Deliver to the far-side receiver',revision:2,theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:3,
    objective:'Create and take any legal finish worth at least 20% against the best keeper reply.',
    coachNote:'The bishop’s diagonal reaches an onside knight at j16, beyond an immediate challenge from the central keeper. The defending rook is wide on a16 rather than on the receiver’s file. A teammate delivery is a useful idea, not a grading requirement.',
    hints:['The keeper is central, so a receiver on the far side has more time.','Follow the bishop’s long diagonal toward j16.','One route is Bd10–Nj16, then the knight’s I-goal finish after the defensive reply.'],
    goal:finish(.20,'box-entry','pass'),
    position:position([...base({defender:[0,1]}),piece('white-B1',3,7),piece('white-N1',9,1)],'white-B1'),
    exampleActions:[kick(9,1),skip(),kick(8,-1)],
  },
  {
    id:'cross-to-the-middle',title:'Cross to the middle',revision:2,theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:3,
    objective:'Create and take any legal finish worth at least 25% after the keeper’s best reply.',
    coachNote:'The keeper shades the near post against a genuinely wide ball. The queen is level with the passer and can receive onside, then carry toward i16 to improve the final chance. The target still accounts for the keeper’s full reaction.',
    hints:['A wide ball naturally draws the keeper toward the near post.','The queen is level with the ball, so it can receive without offside.','One plan is Rb15–Qh15, Qh15–i16, then the I-goal shot. Other sufficiently strong finishes also count.'],
    goal:finish(.25,'box-entry','pass'),
    position:position([...base({keeper:[5,0]}),piece('white-R1',1,2),piece('white-Q',7,2)],'white-R1'),
    exampleActions:[kick(7,2),move('white-Q',8,1),skip(),kick(8,-1)],
  },
  {
    id:'carry-inward',title:'Carry inward, then finish',revision:3,theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:3,
    objective:'Create and take any legal finish worth at least 24% against the best keeper reply.',
    coachNote:'The central keeper is protected by a rook near h16. That defender also restricts a direct king challenge as the queen comes inward. The wide initial shot is poor; carrying to i15 creates a real choice of goal targets against the keeper and covering pieces. Any legal finish meeting the target counts.',
    hints:['The queen’s initial wide shot has a tight angle.','The defender beside the keeper affects its access squares as well as the ball’s route.','A carry from k13 to i15 opens an I-file finish. Compare the direct aim with the legal two-target disguise before shooting.'],
    goal:finish(.24,'box-entry','either'),
    position:position([...base(),piece('black-R2',7,1),piece('white-Q',10,4)],'white-Q','attackMove'),
    exampleActions:[move('white-Q',8,2),skip(),kick(8,-1)],
  },
  {
    id:'pawn-before-the-shot',title:'Win it before the shot',revision:2,theme:'defence',side:'defence',playerTeam:'white',roundLimit:3,
    objective:'Win possession or hold the opponent’s next finishing attempt to 15% or less.',
    coachNote:'The keeper starts centrally. The pawn’s bonus reposition and ordinary tackle are distinct actions; one useful plan uses the free step to set up the diagonal challenge. The queen remains on the board after losing possession.',
    hints:['The pawn does not currently have a diagonal challenge.','It can use one cardinal bonus step without spending the ordinary action.','One plan is Pf7–f6 as the shared bonus, then tackle Qg5 and choose a legal landing such as g4.'],
    goal:defend(.15),
    position:position([piece('white-K',7,16),piece('black-K',7,0),piece('black-Q',6,12),piece('white-P1',5,10),piece('white-R1',12,14),piece('black-R1',13,7)],'black-Q','defendMove','black'),
    exampleActions:[move('white-P1',5,11,true),move('white-P1',6,13)],
  },
  {
    id:'screen-and-cover',title:'Screen the shot and cover the goal',revision:2,theme:'defence',side:'defence',playerTeam:'white',roundLimit:3,
    objective:'Win possession or hold the strongest available finish to 15% or less.',
    coachNote:'A rook on the shooting line supplies a probabilistic body block. The centrally placed king can use its shared bonus to cover the g-file, then hold its position when the shot is declared. Either preparation order works, and other effective legal defences earn credit.',
    hints:['The queen is ready to shoot down the g-file.','A rook screen and a small keeper shift work together.','One plan is Rm4–g4, Kh1–g1 as the shared bonus, then hold the keeper when the shot is declared.'],
    goal:defend(.15),
    position:position([piece('white-K',7,16),piece('black-K',7,0),piece('black-Q',6,12),piece('white-R1',12,13),piece('white-P1',1,12),piece('black-R1',13,7)],'black-Q','defendMove','black'),
    exampleActions:[move('white-R1',6,13),move('white-K',6,16,true),skip()],
  },
  {
    id:'cover-the-declared-aim',title:'Cover the declared aim',revision:2,theme:'defence',side:'defence',playerTeam:'white',roundLimit:3,
    objective:'React to the committed shot and reduce its scoring chance to 20% or less.',
    coachNote:'The keeper starts on g1, near the centre of the goal. The shot is already committed to h, so a one-square shift onto that file improves the save position. The chance is graded rather than the random save result.',
    hints:['The red destination is already committed.','Only your goalkeeper reacts now.','From g1, moving to h1 covers the declared h-file shot. A sound reaction counts even if the sampled shot happens to score.'],
    goal:defend(.20),
    position:position([piece('white-K',6,16),piece('white-R1',0,13),piece('white-P1',12,13),piece('black-K',7,0),piece('black-R1',7,12)],'black-R1','keeperReact','black',{x:7,y:17}),
    exampleActions:[move('white-K',7,16)],
  },
];
const deepFreeze=value=>{
  if(value&&typeof value==='object') {for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}
  return value;
};
export const EXERCISES=deepFreeze([
  ...definitions.map(definition=>({...definition,difficulty:'easy'})),
  ...MEDIUM_EXERCISES,...TOUGH_ATTACK_EXERCISES,...TOUGH_MIXED_EXERCISES,...TOUGH_DEFENCE_EXTRA,
]);

export function createExercisePosition(definitionOrId,seed=1984) {
  const definition=typeof definitionOrId==='string'?EXERCISES.find(item=>item.id===definitionOrId):definitionOrId;
  if(!definition?.position || !Array.isArray(definition.position.pieces))throw new RangeError('Choose a known exercise position.');
  const config=definition.position,state=createGame({mode:'local',seed,foulsEnabled:false});
  state.pieces=config.pieces.map(p=>({...p}));
  const carrier=state.pieces.find(p=>p.id===config.carrierId);
  if(!carrier)throw new RangeError('The exercise needs its declared ball carrier.');
  Object.assign(state,{attack:config.attack||carrier.team,phase:config.phase==='keeperReact'?'kick':config.phase||'attackMove',
    ball:{x:carrier.x,y:carrier.y,carrierId:carrier.id},turn:1,score:{white:0,black:0},
    positionBudget:{normalUsed:false,pawnUsed:false,dribbleUsed:false,...config.positionBudget},
    restart:null,pendingShot:null,offside:null,releaseReason:null,passRun:null,looseBallKickOrigin:null,paceControl:null,lastAction:null,
    log:[`Exercise: ${definition.title}. Unused players are omitted from this study.`]});
  state.ballProgress={team:state.attack,anchorY:state.ball.y,rounds:0,pendingRelease:false,excludeRelease:false};
  if(config.phase==='keeperReact'){
    if(!config.shot)throw new RangeError('A keeper exercise needs a committed shot.');
    return applyKick(state,config.shot.x,config.shot.y,{disguise:!!config.shot.disguise});
  }
  return state;
}
