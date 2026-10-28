/** Curated reduced Football Chess studies. Unused players are deliberately omitted.
 * Example actions document one native route against the deterministic Tactical
 * bot; session grading evaluates the objective, never this move list.
 */
import {createGame,applyKick} from './engine.js?v=1711834496ff';

const piece=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
const base=({keeper=[8,0],defender=[12,3]}={})=>[
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
    id:'pick-the-open-file',title:'Pick the open file',theme:'one-on-one',side:'attack',playerTeam:'white',roundLimit:3,
    objective:'Take a shot worth at least 65% against the best goalkeeper reply.',
    coachNote:'The queen is close and central while the keeper is displaced. Judge the available file before spending time on another pass.',
    hints:['You already have a close finishing position.','The keeper is toward the i-file. Which legal goal target is farther from it?','The queen can shoot straight up the g-file. A good shot succeeds as an exercise even if the match roll produces a save.'],
    goal:finish(.65),
    position:position([...base({defender:[13,1]}),piece('white-Q',6,2)],'white-Q'),
    exampleActions:[kick(6,-1)],
  },
  {
    id:'knights-two-posts',title:'The knight has two posts',theme:'one-on-one',side:'attack',playerTeam:'white',roundLimit:3,
    objective:'Use a legal knight finish worth at least 45% after the best keeper reply.',
    coachNote:'A knight shoots with one L-shaped kick. Both reachable goal targets are useful here; the far-side target is strongest, and disguise is another legal option.',
    hints:['The knight does not shoot straight ahead.','Look one file across and two ranks toward the net.','From g16, F and H are legal L-shaped targets. Compare them or use the two-target disguise.'],
    goal:finish(.45),
    position:position([...base({defender:[13,1]}),piece('white-N1',6,1)],'white-N1'),
    exampleActions:[kick(5,-1)],
  },
  {
    id:'queen-two-targets',title:'Keep the goalkeeper guessing',theme:'one-on-one',side:'attack',playerTeam:'white',roundLimit:3,
    objective:'Create a finish worth at least 35%; more than one target or shooting choice can succeed.',
    coachNote:'The queen reaches two goal targets. Disguise makes the keeper respond before the actual target is chosen. Either sufficiently strong direct aim also counts.',
    hints:['The queen has a straight target and a diagonal target.','The keeper can react to a single declared aim, but a disguised shot shows two possibilities.','From g16, G and I are legal targets. The disguised pair is a strong way to use both.'],
    goal:finish(.35),
    position:position([...base({keeper:[7,0],defender:[13,1]}),piece('white-Q',6,1)],'white-Q'),
    exampleActions:[kick(6,-1,true)],
  },
  {
    id:'release-the-knight',title:'Release the knight beyond the line',theme:'through-ball',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Play a forward ball into space, collect with an onside teammate, then attempt a finish worth at least 35%.',
    coachNote:'The knight starts level with the second-last defender. Its position at the pass matters; it may cross the old line afterward. Collecting a teammate\'s pass still leaves its separate dribble available.',
    hints:['The bishop cannot finish directly, but it can send a diagonal ball beyond the defensive line.','The knight on f13 can jump to h14 after the pass.','Play Bd10–h14, collect with Nf13–h14, then consider the knight\'s second jump toward i16 before ending positioning.'],
    goal:finish(.35,'through-ball'),
    position:position([...base({keeper:[5,0],defender:[4,4]}),piece('white-B1',3,7),piece('white-N1',5,4)],'white-B1'),
    exampleActions:[kick(7,3),move('white-N1',7,3),move('white-N1',8,1),skip(),kick(7,-1)],
  },
  {
    id:'diagonal-pocket',title:'Find the diagonal pocket',theme:'through-ball',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Find empty space ahead of the queen, collect with the knight, and create a finish worth at least 35%.',
    coachNote:'The pass goes to space, not to the knight\'s current square. The receiver is onside at release and can collect inside the box because this is a teammate\'s pass.',
    hints:['The knight is already level with the second-last defender.','The empty h15 square is on the queen\'s diagonal and one knight jump away.','Try Qf13–h15, Nf14–h15 to collect, then Nf16 as a close finishing square.'],
    goal:finish(.35,'through-ball'),
    position:position([...base({defender:[4,3]}),piece('white-Q',5,4),piece('white-N1',5,3)],'white-Q'),
    exampleActions:[kick(7,2),move('white-N1',7,2),move('white-N1',5,1),skip(),kick(6,-1)],
  },
  {
    id:'pass-down-the-channel',title:'Pass down the channel',theme:'through-ball',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Use a forward rook pass into space and a teammate collection to build a finish worth at least 35%.',
    coachNote:'A through ball does not have to be diagonal. The rook\'s file creates the route; the knight changes the direction after collecting.',
    hints:['The rook has no direct goal shot from the d-file.','A forward pass down that file can meet the knight coming in from b14.','Send Rd11–d15, collect with Nb14–d15, then jump to f16 and look for the G goal.'],
    goal:finish(.35,'through-ball'),
    position:position([...base({defender:[4,3]}),piece('white-R1',3,6),piece('white-N1',1,3)],'white-R1'),
    exampleActions:[kick(3,2),move('white-N1',3,2),move('white-N1',5,1),skip(),kick(6,-1)],
  },
  {
    id:'diagonal-delivery',title:'Deliver to the box',theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:3,
    objective:'Complete a teammate pass into the attacking box, then attempt a finish worth at least 35%.',
    coachNote:'The bishop\'s diagonal reaches an onside knight already inside the box. The knight can lob intervening bodies, but still uses an ordinary one-jump shooting pattern.',
    hints:['A teammate is waiting inside the box, level with the second-last defender.','Follow the bishop\'s diagonal from b12.','Bb12–Nf16 is a legal onside delivery. After the Tactical response, the knight can aim at the G goal.'],
    goal:finish(.35,'box-entry','pass'),
    position:position([...base({defender:[12,1]}),piece('white-B1',1,5),piece('white-N1',5,1)],'white-B1'),
    exampleActions:[kick(5,1),skip(),kick(6,-1)],
  },
  {
    id:'cross-to-the-middle',title:'Cross to the middle',theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:3,
    objective:'Pass into the box and create a central finish worth at least 25% after the keeper\'s best reply.',
    coachNote:'Width becomes useful when it finds a central receiver. The queen is level with the ball, so it is onside even though it is beyond the second-last outfield defender.',
    hints:['The wide rook cannot shoot directly into this goal.','The queen in the middle is level with the ball and can receive legally.','Play Rb15–Qh15, then prepare the h-file finish. You may also improve the queen\'s position before ending the next attacking turn.'],
    goal:finish(.25,'box-entry','pass'),
    position:position([...base({keeper:[4,0]}),piece('white-R1',1,2),piece('white-Q',7,2)],'white-R1'),
    exampleActions:[kick(7,2),skip(),kick(7,-1)],
  },
  {
    id:'carry-inward',title:'Carry inward, then finish',theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:3,
    objective:'Enter the attacking box by a pass or ordinary dribble, then attempt a finish worth at least 60%.',
    coachNote:'The initial wide shot has a tight angle. An ordinary queen dribble can enter the box using double-cost squares; the better shooting lane is inside rather than farther along the wing.',
    hints:['The first legal shot is not the best chance.','Ordinary dribbling into the box is allowed; pass-and-run entry is a different rule.','A diagonal carry from k13 toward i15 gives the queen a much better view and a direct i-file finish.'],
    goal:finish(.60,'box-entry','either'),
    position:position([...base({keeper:[4,0]}),piece('white-Q',10,4)],'white-Q','attackMove'),
    exampleActions:[move('white-Q',8,2),skip(),kick(8,-1)],
  },
  {
    id:'pawn-before-the-shot',title:'Win it before the shot',theme:'defence',side:'defence',playerTeam:'white',roundLimit:3,
    objective:'Win possession or hold the opponent\'s next finishing attempt to 15% or less.',
    coachNote:'The pawn\'s bonus reposition and ordinary tackle are distinct actions. Use the free step first, then the regular diagonal challenge; the queen remains on the board after losing possession.',
    hints:['The pawn does not currently have a diagonal challenge.','It can use one cardinal bonus step without spending the ordinary action.','Use Pf7–f6 as the shared bonus, then tackle Qg5 and choose a legal landing such as g4.'],
    goal:defend(.15),
    position:position([piece('white-K',8,16),piece('black-K',7,0),piece('black-Q',6,12),piece('white-P1',5,10),piece('white-R1',12,14),piece('black-R1',13,7)],'black-Q','defendMove','black'),
    exampleActions:[move('white-P1',5,11,true),move('white-P1',6,13)],
  },
  {
    id:'screen-and-cover',title:'Screen the shot and cover the goal',theme:'defence',side:'defence',playerTeam:'white',roundLimit:3,
    objective:'Win the ball or reduce the opponent\'s actual shot chance to 15% or less.',
    coachNote:'A rook on the shooting line supplies a probabilistic body block; the king then covers the aim. Neither alone is as strong as coordinating the regular move, shared bonus and later keeper reaction.',
    hints:['The queen is ready to shoot down the g-file.','Move a defender onto that line while using the shared bonus to bring the keeper closer.','One plan is Rm4–g4, the king bonus Ki1–h1, then Kh1–g1 when the shot is declared. Reversing the first two actions also works.'],
    goal:defend(.15),
    position:position([piece('white-K',8,16),piece('black-K',7,0),piece('black-Q',6,12),piece('white-R1',12,13),piece('white-P1',1,12),piece('black-R1',13,7)],'black-Q','defendMove','black'),
    exampleActions:[move('white-R1',6,13),move('white-K',7,16,true),move('white-K',6,16)],
  },
  {
    id:'cover-the-declared-aim',title:'Cover the declared aim',theme:'defence',side:'defence',playerTeam:'white',roundLimit:3,
    objective:'React to the committed shot and reduce its scoring chance to 20% or less.',
    coachNote:'The shot is already declared, so this is a keeper decision. Moving onto the actual h-file reduces the chance substantially; an aligned goal-line square is stronger than moving away or merely holding.',
    hints:['The red destination is already committed.','Only your goalkeeper reacts now.','From i1, move the keeper to h1 to cover the h-file shot. The exercise grades the resulting chance, not whether the random save succeeds.'],
    goal:defend(.20),
    position:position([piece('white-K',8,16),piece('white-R1',0,13),piece('white-P1',12,13),piece('black-K',7,0),piece('black-R1',7,12)],'black-R1','keeperReact','black',{x:7,y:17}),
    exampleActions:[move('white-K',7,16)],
  },
];
const deepFreeze=value=>{
  if(value&&typeof value==='object') {for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}
  return value;
};
export const EXERCISES=deepFreeze(definitions);

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
