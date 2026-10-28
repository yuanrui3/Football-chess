/** Crowded combination studies. The example line is illustrative; objectives remain flexible. */
const piece=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
const move=(pieceId,x,y,freePawn=false)=>({type:'move',pieceId,x,y,...(freePawn?{freePawn:true}:{})});
const kick=(x,y,disguise=false)=>({type:'kick',x,y,...(disguise?{disguise:true}:{})});
const skip=()=>({type:'skip'});
const attackingSupport=()=>[piece('white-K',6,16),piece('black-K',4,0),piece('black-R1',13,0),piece('black-R2',0,0),piece('black-B1',11,1),piece('black-N1',2,7),piece('black-P1',3,8),piece('white-P1',5,7),piece('white-P2',9,8),piece('white-B2',10,9),piece('white-N2',2,10)];
export const TOUGH_MIXED_EXERCISES=[
 {
  id:'tough-unlock-the-rook-battery',title:'Unlock the rook battery',difficulty:'tough',planSteps:4,theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
  objective:'Create and take a finish worth at least 60% against the best goalkeeper reaction. Any legal plan can earn credit.',
  coachNote:'One useful route treats the first rook as a distributor and the second as a finisher. After that lateral transfer, clearing the bishop opens the f-file for a forward carry. The nearby knight occupies a keeper approach square. Compare this plan with other legal routes; the result, rather than the transfer or clearance sequence, earns credit.',
  hints:['The ball begins on a wide rook. Its teammate has a promising file, but a friendly bishop is in the way.','A pass starts a fresh positioning phase: the bishop’s ordinary move and the rook’s dribble are separate allowances.','Try Rc13–Rf13, Bf14–g15 to clear the file, Rf13–f16, then the F-goal shot. End positioning before shooting.'],
  goal:{type:'finish',minShotXG:.60,boxEntryMode:'either'},
  position:{pieces:[piece('white-K',6,16),piece('black-K',9,0),piece('black-R1',13,0),piece('black-R2',0,0),piece('black-B1',11,1),piece('black-N1',1,8),piece('black-P1',11,10),piece('white-P1',5,7),piece('white-P2',9,8),piece('white-B2',10,9),piece('white-N2',2,10),piece('white-R1',2,4),piece('white-R2',5,4),piece('white-B1',5,3),piece('white-N1',6,1)],carrierId:'white-R1',phase:'kick',attack:'white'},
  exampleActions:[kick(5,4),move('white-B1',6,2),move('white-R2',5,1),skip(),kick(5,-1)]
 },
 {
  id:'tough-find-the-protected-pocket',title:'Find the protected pocket',difficulty:'tough',planSteps:4,theme:'through-ball',side:'attack',playerTeam:'white',roundLimit:4,
  objective:'Create and take a finish worth at least 35% against the best goalkeeper reaction. Any legal plan can earn credit.',
  coachNote:'The illustrated forward pass draws the knight into h15; its next jump changes the angle toward f16. The supporting pawn on g15 denies the opposing pawn’s bonus route to a diagonal tackle, and the rook controls a nearby keeper access square. Receiving in space and dribbling are separate allowances. A different legal plan with sufficient shot quality also succeeds.',
  hints:['The knight has several jumping squares, but one pocket is protected by its own supporting pieces.','Look for an empty forward square on the queen’s file that an onside knight can collect.','Try Qh10–h15, Nf14–h15 to collect, Nh15–f16, then the G-goal finish. The pawn on g15 matters when judging the opponent’s free pawn move.'],
  goal:{type:'finish',minShotXG:.35,boxEntryMode:'pass'},
  position:{pieces:[piece('white-K',6,16),piece('black-K',8,0),piece('black-R1',13,0),piece('black-R2',0,0),piece('black-B1',11,1),piece('black-N1',1,8),piece('black-P1',6,3),piece('white-P1',5,7),piece('white-P2',9,8),piece('white-B2',10,9),piece('white-N2',2,10),piece('white-Q',7,7),piece('white-N1',5,3),piece('white-R1',6,1),piece('white-P3',6,2),piece('white-B1',2,5)],carrierId:'white-Q',phase:'kick',attack:'white'},
  exampleActions:[kick(7,2),move('white-N1',7,2),move('white-N1',5,1),skip(),kick(6,-1)]
 },
 {
  id:'tough-clear-the-delivery-diagonal',title:'Clear the delivery diagonal',difficulty:'tough',planSteps:3,revision:2,theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
  objective:'Create and take a finish worth at least 35% against the best goalkeeper reaction. Any legal plan can earn credit.',
  coachNote:'A bishop clearance toward j13 opens the queen–knight delivery without leaving the bishop on that diagonal. The keeper starts wide on c17 and is recovering into its box; using the opening promptly prevents a later king challenge. The two deep rooks hold the offside line. This is one illustrative route; a different legal finish meeting the target receives the same credit.',
  hints:['The queen can see an advanced knight, but a friendly bishop interrupts the route.','Move the bishop off the entire queen–knight diagonal, not merely along it.','One route is Bk14–j13, Qm12–Ni16, then the knight’s H-goal finish. End positioning as required and watch the Tactical replies.'],
  goal:{type:'finish',minShotXG:.35,boxEntryMode:'pass'},
  position:{pieces:[...attackingSupport().map(p=>p.id==='black-K'?{...p,x:2}:p),piece('white-Q',12,5),piece('white-N1',8,1),piece('white-B1',10,3)],carrierId:'white-Q',phase:'attackMove',attack:'white'},
  exampleActions:[move('white-B1',9,4),skip(),kick(8,1),skip(),kick(7,-1)]
 },
 {
  id:'tough-pawn-screen-keeper-route',title:'A screen and a keeper route',difficulty:'tough',planSteps:3,revision:2,theme:'defence',side:'defence',playerTeam:'white',roundLimit:3,
  objective:'Hold the opponent’s finishing chance to 12% or less, or win possession. Any legal defensive plan can earn credit.',
  coachNote:'The two knights and bishop press the carrier’s escape squares, while the rook covers the forward outlet. With those pieces containing the attack, one coordinated plan gives the king an ordinary step and uses the pawn bonus to screen h2 before the separate keeper reaction. Either preparation order works. A different sufficiently effective legal defence earns the same credit.',
  hints:['The rook’s h-file shot is dangerous, and the keeper is two files away.','Use different budgets: an ordinary king move, then the pawn’s shared bonus screen.','One plan is Kf1–g1, Pg2–h2 as the bonus, then Kg1–h1 when the shot is declared. Reversing the first two preparations also works.'],
  goal:{type:'defend',maxOpponentShotXG:.12},
  position:{pieces:[piece('black-K',7,0),piece('black-R1',13,7),piece('black-Q',0,5),piece('black-B1',2,4),piece('black-N1',11,6),piece('black-P1',4,8),piece('white-Q',10,8),piece('white-R1',6,13),piece('white-B1',7,11),piece('white-N1',6,12),piece('white-N2',8,12),piece('white-P2',9,9),piece('white-K',5,16),piece('black-R2',7,12),piece('white-P1',6,15)],carrierId:'black-R2',phase:'defendMove',attack:'black'},
  exampleActions:[move('white-K',6,16),move('white-P1',7,15,true),move('white-K',7,16)]
 }
];
