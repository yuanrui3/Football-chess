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
    id:'tough-wide-rook-relay',title:'Relay wide, escape the keeper',difficulty:'tough',planSteps:4,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Complete two teammate passes, enter the box and create a finish worth at least 15%.',
    coachNote:'The wide relay changes the line of attack. After the cross, the queen must escape beyond the keeper’s tackling reach; the tempting nearer i15 square lets the king win the ball before the shot.',
    hints:['Use the two wide rooks to connect the buildup to the central queen.','The keeper can use both a bonus step and an ordinary tackle. Choose a finishing square it cannot reach in time.','One plan is Rb11–Rb14, then Qh14, Qh14–j16 and a diagonal shot at H.'],
    goal:{type:'finish',minShotXG:.15,requires:'box-entry',boxEntryMode:'either',minCompletedPasses:2},
    position:{pieces:[...flankSupport(),p('white-R1',1,6),p('white-R2',1,3),p('white-Q',7,3)],carrierId:'white-R1',phase:'kick',attack:'white'},
    exampleActions:[kick(1,3),skip(),kick(7,3),move('white-Q',9,1),skip(),kick(7,-1)],
  },
  {
    id:'tough-relay-to-knight',title:'Cross, jump, and chip',difficulty:'tough',planSteps:4,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Complete two teammate passes and carry into the box for a finish worth at least 40%.',
    coachNote:'The rook relay supplies the width; the knight supplies the last change of direction. A knight on i14 cannot shoot into the net yet. Its jump to j16 both enters the box and creates the L-shaped shot at I.',
    hints:['Connect the wide rooks before releasing the knight.','The knight needs to change both rank and file before it has a legal goal target.','Play Rb11–Rb14, cross to Ni14, jump to j16, then shoot at I.'],
    goal:{type:'finish',minShotXG:.40,requires:'box-entry',boxEntryMode:'either',minCompletedPasses:2},
    position:{pieces:[...flankSupport(),p('white-R1',1,6),p('white-R2',1,3),p('white-N1',8,3)],carrierId:'white-R1',phase:'kick',attack:'white'},
    exampleActions:[kick(1,3),skip(),kick(8,3),move('white-N1',9,1),skip(),kick(8,-1)],
  },
  {
    id:'tough-knight-wall-pass',title:'The jumping wall pass',difficulty:'tough',planSteps:3,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Link three players with two passes into the box, then create a finish worth at least 20%.',
    coachNote:'The bishop reaches the wide knight, whose L-shaped pass reaches a different diagonal. This third-player connection beats the central bodies without asking a sliding piece to pass through them.',
    hints:['The bishop cannot reach the queen directly. Look for a teammate that changes the passing geometry.','The knight on d15 can link to the queen on f16 despite the crowded central corridor.','Play Ba12–Nd15, then Qf16, and finish diagonally at H. A two-target disguise is another possible finish.'],
    goal:{type:'finish',minShotXG:.20,requires:'box-entry',boxEntryMode:'pass',minCompletedPasses:2},
    position:{pieces:[p('white-K',6,16),p('white-B1',0,5),p('white-N1',3,2),p('white-Q',5,1),p('white-N2',7,1),p('white-P1',5,8),p('white-R1',0,8),p('black-K',9,0),p('black-R1',12,0),p('black-R2',13,1),p('black-B1',13,8),p('black-N1',10,4),p('black-P1',4,5),p('black-P2',8,5)],carrierId:'white-B1',phase:'kick',attack:'white'},
    exampleActions:[kick(3,2),skip(),kick(5,1),skip(),kick(7,-1)],
  },
  {
    id:'tough-through-ball-layoff',title:'Through the line, then lay off',difficulty:'tough',planSteps:4,
    theme:'through-ball',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Complete a through ball and a second teammate pass, then attempt a finish worth at least 15%.',
    coachNote:'The first pass is into empty space rather than to a stationary target. The onside knight collects and supplies the inside layoff. The pawn on e15 shields the queen from the rook’s file tackle, so preserve that cover.',
    hints:['Use the c-file to pass beyond the defender on e14.','The knight can collect c15 from a14 and then link to the queen with another L-shaped kick.','Try Rc12–c15, Na14–c15 to collect, Nc15–Qe16, then a diagonal shot at G.'],
    goal:{type:'finish',minShotXG:.15,requires:'through-ball',boxEntryMode:'pass',minCompletedPasses:2},
    position:{pieces:[p('white-K',6,16),p('white-R1',2,5),p('white-N1',0,3),p('white-Q',4,1),p('white-P2',4,2),p('white-P1',5,8),p('white-B1',9,7),p('black-K',9,0),p('black-R1',12,0),p('black-R2',4,3),p('black-B1',13,1),p('black-N1',10,4),p('black-P1',4,5),p('black-P2',8,5)],carrierId:'white-R1',phase:'kick',attack:'white'},
    exampleActions:[kick(2,2),move('white-N1',2,2),skip(),kick(4,1),skip(),kick(6,-1)],
  },
  {
    id:'tough-clear-offside-runner',title:'Clear the offside runner first',difficulty:'tough',planSteps:4,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Remove the offside interference, complete a teammate pass and enter the box for a finish worth at least 10%.',
    coachNote:'The advanced knight is involved in play merely by occupying the box while offside. Move it out before the kick. After the cross, the queen must still escape the keeper’s two-action tackling reach; the rook’s defensive screen keeps the eventual chance modest.',
    hints:['Before planning the cross, inspect the knight already inside the box.','A non-carrier move can remove the offside box interference without spending the queen’s later dribble.','Move Nf16–d15, then cross Rb14–Qh14, carry the queen to j16 and shoot diagonally at H.'],
    goal:{type:'finish',minShotXG:.10,requires:'box-entry',boxEntryMode:'either',minCompletedPasses:1},
    position:{pieces:[...flankSupport().map(piece=>piece.id==='black-R1'?{...piece,y:3}:piece),p('white-R1',1,3),p('white-N1',5,1),p('white-Q',7,3)],carrierId:'white-R1',phase:'attackMove',attack:'white'},
    exampleActions:[move('white-N1',3,2),skip(),kick(7,3),move('white-Q',9,1),skip(),kick(7,-1)],
  },
  {
    id:'tough-sweeper-to-bishop',title:'The sweeper’s diagonal outlet',difficulty:'tough',planSteps:3,
    theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
    objective:'Build from the advanced king through two teammate passes into the box, then take a finish worth at least 15%.',
    coachNote:'The king is already outside its box, so it is an ordinary piece and does not provide saves. Its long file pass reaches a bishop whose diagonal supplies the box. This release avoids trying to carry the slow king through midfield.',
    hints:['The advanced king can distribute much farther than it can move.','The bishop on b13 links the king’s file to the queen’s diagonal pocket.','Try Kb5–Bb13, then Qe16, and finish diagonally at G. Keep the other knight’s screening position on h16.'],
    goal:{type:'finish',minShotXG:.15,requires:'box-entry',boxEntryMode:'pass',minCompletedPasses:2},
    position:{pieces:[p('white-K',1,12),p('white-B1',1,4),p('white-N1',2,7),p('white-Q',4,1),p('white-N2',7,1),p('white-P1',5,8),p('white-R1',0,8),p('black-K',9,0),p('black-R1',12,0),p('black-R2',13,1),p('black-B1',13,8),p('black-N1',10,4),p('black-P1',4,5),p('black-P2',8,5)],carrierId:'white-K',phase:'kick',attack:'white'},
    exampleActions:[kick(1,4),skip(),kick(4,1),skip(),kick(6,-1)],
  },
];
