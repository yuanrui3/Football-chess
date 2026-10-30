/** Longer attacking combinations. Native session objectives admit alternatives. */
const p=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
const move=(pieceId,x,y)=>({type:'move',pieceId,x,y});
const kick=(x,y,disguise=false)=>({type:'kick',x,y,...(disguise?{disguise:true}:{})});
const skip=()=>({type:'skip'});
const flankSupport=()=>[
  p('white-K',6,16),p('white-B1',9,7),p('white-N2',2,9),p('white-P1',5,8),
  p('black-K',6,0),p('black-R1',12,0),p('black-B1',13,8),p('black-N1',10,4),
  p('black-P1',4,5),p('black-P2',8,5),p('black-P3',6,6),
];
export const TOUGH_ATTACK_EXERCISES=[
  {
    id:'tough-wide-rook-relay',title:'Open the rook’s finishing file',difficulty:'tough',planSteps:4,revision:2,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take a finish worth at least 15% against the best keeper response. Any legal route can succeed.',
    coachNote:'The keeper starts centrally on g17. One plan moves the queen to i14 to deny the bishop access, then carries the receiving rook to the g-file. This creates a 19% finish through the defensive reply; the target rewards the clear file rather than an unguarded goal.',
    hints:['After the first pass, compare a rook carry with another pass.','The queen can support without receiving: its off-ball move can deny a defensive bishop square.','One candidate is Rb11–Rb14, Qh14–i14 off ball, Rb14–g14, then the G-goal shot. Other legal finishes above the target count.'],
    goal:{type:'finish',minShotXG:.15},
    position:{pieces:[...flankSupport(),p('white-R1',1,6),p('white-R2',1,3),p('white-Q',7,3)],carrierId:'white-R1',phase:'kick',attack:'white'},
    exampleActions:[kick(1,3),move('white-Q',8,3),move('white-R2',6,3),skip(),kick(6,-1)],
  },
  {
    id:'tough-relay-to-knight',title:'Cross, jump, and chip',difficulty:'tough',planSteps:4,revision:3,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take a finish worth at least 20% against the best keeper response. Any legal route can succeed.',
    coachNote:'The keeper starts centrally on g17 and can use its ordinary move and shared bonus to cover the receiving knight. The relay supplies width before i14–j16 creates an L-shaped I-goal shot. Against that natural cover the checked chance is about 23%, rather than the old stranded-keeper chance.',
    hints:['Compare the receiving knight’s route with the keeper’s central coverage.','A knight on i14 has no immediate goal target; a change of rank and file can create one.','One candidate is Rb11–Rb14, then Ni14, Nj16 and the I-goal shot. Other legal finishes above the target count.'],
    goal:{type:'finish',minShotXG:.20},
    position:{pieces:[...flankSupport().map(piece=>piece.id==='black-P1'?{...piece,y:6}:piece),p('white-R1',1,6),p('white-R2',1,3),p('white-N1',8,3)],carrierId:'white-R1',phase:'kick',attack:'white'},
    exampleActions:[kick(1,3),skip(),kick(8,3),move('white-N1',9,1),skip(),kick(8,-1)],
  },
  {
    id:'tough-knight-wall-pass',title:'Link through the knight, then escape',difficulty:'tough',planSteps:4,revision:2,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take a finish worth at least 15% against the best keeper response. Any legal route can succeed.',
    coachNote:'The keeper starts centrally on g17, so an immediate close knight carry invites a challenge. One plan uses the knight as a wall player, then carries the receiving queen across to j16 before shooting diagonally. The pawn on l16 blocks the opposing rook’s horizontal challenge. The resulting covered finish is about 17%.',
    hints:['The knight can link to the queen without trying to finish beside the central keeper.','After receiving on f16, the queen can use its own dribble to escape across the box. Check the rook pressure from n16.','One candidate is Ba12–Nd15, Nd15–Qf16, Qf16–j16, then the H-goal shot. End positioning between kicks; other qualifying plans count.'],
    goal:{type:'finish',minShotXG:.15},
    position:{pieces:[p('white-K',6,16),p('white-B1',0,5),p('white-N1',3,2),p('white-Q',5,1),p('white-N2',7,2),p('white-P1',5,8),p('white-P2',11,1),p('white-R1',0,8),p('black-K',6,0),p('black-R1',12,0),p('black-R2',13,1),p('black-B1',13,8),p('black-N1',10,4),p('black-P1',4,5),p('black-P2',8,5)],carrierId:'white-B1',phase:'kick',attack:'white'},
    exampleActions:[kick(3,2),skip(),kick(5,1),move('white-Q',9,1),skip(),kick(7,-1)],
  },
  {
    id:'tough-through-ball-layoff',title:'Through the line, then lay off',difficulty:'tough',planSteps:4,revision:3,
    theme:'through-ball',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take a finish worth at least 13% against the best keeper response. Any legal route can succeed.',
    coachNote:'The keeper starts centrally on g17. One plan sends a diagonal pass into space, collects with an onside knight and lays back to the rook. The queen and bishop restrict diagonal blocking routes, so the rook can use its long-shot strength from h12. The checked chance is about 14% against the keeper’s cover.',
    hints:['The first pass can reach space ahead of the knight rather than a stationary receiver.','After collecting g14, the knight has a backward L-shaped link to the rook on h12.','One candidate is Ba8–g14, Ne13–g14 to collect, Ng14–Rh12, then the H-goal shot. Other sufficiently strong legal finishes also count.'],
    goal:{type:'finish',minShotXG:.13},
    position:{pieces:[p('white-K',6,16),p('white-B1',0,9),p('white-B2',9,3),p('white-Q',9,5),p('white-N1',4,4),p('white-R1',7,5),p('white-P1',5,9),p('white-P2',9,7),p('black-K',6,0),p('black-R1',0,0),p('black-R2',13,0),p('black-B1',12,8),p('black-N1',13,10),p('black-P1',1,7),p('black-P2',11,9)],carrierId:'white-B1',phase:'kick',attack:'white'},
    exampleActions:[kick(6,3),move('white-N1',6,3),skip(),kick(7,5),skip(),kick(7,-1)],
  },
  {
    id:'tough-clear-offside-runner',title:'Clear the offside runner first',difficulty:'tough',planSteps:3,revision:2,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take a legal finish worth at least 10% against the best keeper response. Normal offside rules still apply.',
    coachNote:'The advanced knight is involved while offside, but the remedy does not require the old cross and queen carry. Clearing it lets the rook use its independent dribble allowance to find the g-file and shoot. The stronger, shorter legal plan earns the same credit.',
    hints:['Inspect the advanced knight before choosing a finishing route.','The ordinary off-ball move and the rook’s dribble are separate actions; a teammate pass is not compulsory.','One candidate is Nf16–d15, Rb14–g14 with the ball, then the G-goal shot. End positioning before shooting.'],
    goal:{type:'finish',minShotXG:.10},
    position:{pieces:[...flankSupport().map(piece=>piece.id==='black-R1'?{...piece,y:3}:piece),p('white-R1',1,3),p('white-N1',5,1),p('white-Q',7,3)],carrierId:'white-R1',phase:'attackMove',attack:'white'},
    exampleActions:[move('white-N1',3,2),move('white-R1',6,3),skip(),kick(6,-1)],
  },
  {
    id:'tough-sweeper-to-bishop',title:'Build from the goalkeeper',difficulty:'tough',planSteps:4,revision:3,
    theme:'one-on-one',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take a finish worth at least 13% against the best keeper response. Any legal buildup can succeed.',
    coachNote:'Both keepers begin centrally on their goal lines. One buildup uses the two rooks as a relay, while a queen support move denies the bishop a diagonal blocking square. The final long shot is worth about 14% against a properly placed keeper; without that support move the route produces under 8%.',
    hints:['The keeper can start the attack with a legal long pass from g1.','Before forwarding from the first rook, inspect the bishop’s diagonal route toward the shooting file.','One candidate is Kg1–Rg8, Qj11–j12 off ball, Rg8–Rg12, then the G-goal shot. A different support square or qualifying plan also counts.'],
    goal:{type:'finish',minShotXG:.13},
    position:{pieces:[p('white-K',6,16),p('white-R1',6,9),p('white-R2',6,5),p('white-Q',9,6),p('white-B1',3,7),p('white-N1',2,5),p('white-P1',5,9),p('black-K',6,0),p('black-R1',0,0),p('black-R2',13,0),p('black-B1',12,8),p('black-N1',13,10),p('black-P1',1,7),p('black-P2',11,9)],carrierId:'white-K',phase:'kick',attack:'white'},
    exampleActions:[kick(6,9),move('white-Q',9,5),skip(),kick(6,5),skip(),kick(6,-1)],
  },
];
