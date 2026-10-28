/** Longer attacking combinations. Native session objectives admit alternatives. */
const p=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
const move=(pieceId,x,y)=>({type:'move',pieceId,x,y});
const kick=(x,y,disguise=false)=>({type:'kick',x,y,...(disguise?{disguise:true}:{})});
const skip=()=>({type:'skip'});
const flankSupport=()=>[
  p('white-K',6,16),p('white-B1',9,7),p('white-N2',2,9),p('white-P1',5,8),
  p('black-K',4,0),p('black-R1',12,0),p('black-B1',13,8),p('black-N1',10,4),
  p('black-P1',4,5),p('black-P2',8,5),p('black-P3',6,6),
];
export const TOUGH_ATTACK_EXERCISES=[
  {
    id:'tough-wide-rook-relay',title:'Open the rook’s finishing file',difficulty:'tough',planSteps:4,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take a finish worth at least 15% against the best keeper response. Any legal route can succeed.',
    coachNote:'The receiving rook can become the finisher instead of automatically forwarding the ball. One stronger plan moves the queen to i14 to deny the bishop access, then carries the rook to the g-file. This produces a better finish than the longer queen relay in the original hint.',
    hints:['After the first pass, compare a rook carry with another pass.','The queen can support without receiving: its off-ball move can deny a defensive bishop square.','One candidate is Rb11–Rb14, Qh14–i14 off ball, Rb14–g14, then the G-goal shot. Other legal finishes above the target count.'],
    goal:{type:'finish',minShotXG:.15},
    position:{pieces:[...flankSupport(),p('white-R1',1,6),p('white-R2',1,3),p('white-Q',7,3)],carrierId:'white-R1',phase:'kick',attack:'white'},
    exampleActions:[kick(1,3),move('white-Q',8,3),move('white-R2',6,3),skip(),kick(6,-1)],
  },
  {
    id:'tough-relay-to-knight',title:'Cross, jump, and chip',difficulty:'tough',planSteps:4,revision:2,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take a finish worth at least 40% against the best keeper response. Passes and box entry are suggestions, not requirements.',
    coachNote:'The keeper starts wide of its box and can recover during each defensive reply. The rook relay supplies width and the knight changes the shooting angle. One plan uses i14–j16 to create the L-shaped shot at I; other qualifying routes count too.',
    hints:['Compare the keeper’s recovery time with the receiving knight’s route.','A knight on i14 has no immediate goal target; a change of rank and file can create one.','One candidate is Rb11–Rb14, then Ni14, Nj16 and the I-goal shot. You may find another finish above the same quality target.'],
    goal:{type:'finish',minShotXG:.40},
    position:{pieces:[...flankSupport().map(piece=>piece.id==='black-K'?{...piece,x:2}:piece.id==='black-P1'?{...piece,y:6}:piece),p('white-R1',1,6),p('white-R2',1,3),p('white-N1',8,3)],carrierId:'white-R1',phase:'kick',attack:'white'},
    exampleActions:[kick(1,3),skip(),kick(8,3),move('white-N1',9,1),skip(),kick(8,-1)],
  },
  {
    id:'tough-knight-wall-pass',title:'Clear the knight’s finishing pocket',difficulty:'tough',planSteps:4,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take a finish worth at least 20% against the best keeper response. A stronger legal route earns credit too.',
    coachNote:'A knight carry is stronger than automatically completing the old two-pass wall combination. The queen can vacate f16 while remaining involved as support, allowing the receiving knight to jump into that close finishing pocket. This is an example, not a required answer.',
    hints:['Compare the receiving knight’s own finishing route with another pass.','The queen occupies a useful knight landing square and can move off the ball before the knight dribbles.','One candidate is Ba12–Nd15, Qf16–g15 off ball, Nd15–f16, then the G-goal finish. A different qualifying route also succeeds.'],
    goal:{type:'finish',minShotXG:.20},
    position:{pieces:[p('white-K',6,16),p('white-B1',0,5),p('white-N1',3,2),p('white-Q',5,1),p('white-N2',7,1),p('white-P1',5,8),p('white-R1',0,8),p('black-K',9,0),p('black-R1',12,0),p('black-R2',13,1),p('black-B1',13,8),p('black-N1',10,4),p('black-P1',4,5),p('black-P2',8,5)],carrierId:'white-B1',phase:'kick',attack:'white'},
    exampleActions:[kick(3,2),move('white-Q',6,2),move('white-N1',5,1),skip(),kick(6,-1)],
  },
  {
    id:'tough-through-ball-layoff',title:'Through the line, then lay off',difficulty:'tough',planSteps:4,
    theme:'through-ball',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take a finish worth at least 15% against the best keeper response. The through-ball theme is optional coaching.',
    coachNote:'The first pass is into empty space rather than to a stationary target. The onside knight collects and supplies the inside layoff. The pawn on e15 shields the queen from the rook’s file tackle, so preserve that cover.',
    hints:['Use the c-file to pass beyond the defender on e14.','The knight can collect c15 from a14 and then link to the queen with another L-shaped kick.','Try Rc12–c15, Na14–c15 to collect, Nc15–Qe16, then a diagonal shot at G.'],
    goal:{type:'finish',minShotXG:.15},
    position:{pieces:[p('white-K',6,16),p('white-R1',2,5),p('white-N1',0,3),p('white-Q',4,1),p('white-P2',4,2),p('white-P1',5,8),p('white-B1',9,7),p('black-K',9,0),p('black-R1',12,0),p('black-R2',4,3),p('black-B1',13,1),p('black-N1',10,4),p('black-P1',4,5),p('black-P2',8,5)],carrierId:'white-R1',phase:'kick',attack:'white'},
    exampleActions:[kick(2,2),move('white-N1',2,2),skip(),kick(4,1),skip(),kick(6,-1)],
  },
  {
    id:'tough-clear-offside-runner',title:'Clear the offside runner first',difficulty:'tough',planSteps:3,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take a legal finish worth at least 10% against the best keeper response. Normal offside rules still apply.',
    coachNote:'The advanced knight is involved while offside, but the remedy does not require the old cross and queen carry. Clearing it lets the rook use its independent dribble allowance to find the g-file and shoot. The stronger, shorter legal plan earns the same credit.',
    hints:['Inspect the advanced knight before choosing a finishing route.','The ordinary off-ball move and the rook’s dribble are separate actions; a teammate pass is not compulsory.','One candidate is Nf16–d15, Rb14–g14 with the ball, then the G-goal shot. End positioning before shooting.'],
    goal:{type:'finish',minShotXG:.10},
    position:{pieces:[...flankSupport().map(piece=>piece.id==='black-R1'?{...piece,y:3}:piece),p('white-R1',1,3),p('white-N1',5,1),p('white-Q',7,3)],carrierId:'white-R1',phase:'attackMove',attack:'white'},
    exampleActions:[move('white-N1',3,2),move('white-R1',6,3),skip(),kick(6,-1)],
  },
  {
    id:'tough-sweeper-to-bishop',title:'The sweeper’s diagonal outlet',difficulty:'tough',planSteps:3,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Create and take a finish worth at least 15% against the best keeper response. Any legal buildup from the advanced king is accepted.',
    coachNote:'The king is already outside its box, so it is an ordinary piece and does not provide saves. Its long file pass reaches a bishop whose diagonal supplies the box. This release avoids trying to carry the slow king through midfield.',
    hints:['The advanced king can distribute much farther than it can move.','The bishop on b13 links the king’s file to the queen’s diagonal pocket.','Try Kb5–Bb13, then Qe16, and finish diagonally at G. Keep the other knight’s screening position on h16.'],
    goal:{type:'finish',minShotXG:.15},
    position:{pieces:[p('white-K',1,12),p('white-B1',1,4),p('white-N1',2,7),p('white-Q',4,1),p('white-N2',7,1),p('white-P1',5,8),p('white-R1',0,8),p('black-K',9,0),p('black-R1',12,0),p('black-R2',13,1),p('black-B1',13,8),p('black-N1',10,4),p('black-P1',4,5),p('black-P2',8,5)],carrierId:'white-K',phase:'kick',attack:'white'},
    exampleActions:[kick(1,4),skip(),kick(4,1),skip(),kick(6,-1)],
  },
];
