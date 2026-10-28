/** Crowded combination studies. The example line is illustrative; objectives remain flexible. */
const piece=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
const move=(pieceId,x,y,freePawn=false)=>({type:'move',pieceId,x,y,...(freePawn?{freePawn:true}:{})});
const kick=(x,y,disguise=false)=>({type:'kick',x,y,...(disguise?{disguise:true}:{})});
const skip=()=>({type:'skip'});
const attackingSupport=()=>[piece('white-K',6,16),piece('black-K',6,0),piece('black-R1',13,0),piece('black-R2',0,0),piece('black-B1',11,1),piece('black-N1',8,2),piece('black-P1',8,3),piece('white-P1',5,7),piece('white-P2',9,8),piece('white-B2',10,9),piece('white-N2',2,10)];
export const TOUGH_MIXED_EXERCISES=[
 {
  id:'tough-unlock-the-rook-battery',title:'Unlock the rook battery',difficulty:'tough',planSteps:4,revision:2,theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
  objective:'Create and take a finish worth at least 20% against the best goalkeeper reaction. Any legal plan can earn credit.',
  coachNote:'The keeper begins centrally on g17. One useful plan transfers to the second rook, clears its file and carries only to the edge of the box. That keeps the ball beyond a bonus-assisted king challenge while improving the rook’s shooting distance. The resulting chance is about 22% against proper cover, rather than an almost open goal.',
  hints:['The wide rook has no direct finish. Its teammate can use the f-file, once the friendly bishop leaves it.','Clearance and dribbling have separate allowances. Carrying all the way beside this central keeper would expose the ball.','One plan is Rc13–Rf13, Bf14–g15, Rf13–f14, then the F-goal shot after positioning ends.'],
  goal:{type:'finish',minShotXG:.20},
  position:{pieces:[piece('white-K',6,16),piece('black-K',6,0),piece('black-R1',13,0),piece('black-R2',0,0),piece('black-B1',11,1),piece('black-N1',1,8),piece('black-P1',11,10),piece('white-P1',5,7),piece('white-P2',9,8),piece('white-B2',10,9),piece('white-N2',2,10),piece('white-R1',2,4),piece('white-R2',5,4),piece('white-B1',5,3),piece('white-N1',6,1)],carrierId:'white-R1',phase:'kick',attack:'white'},
  exampleActions:[kick(5,4),move('white-B1',6,2),move('white-R2',5,3),skip(),kick(5,-1)]
 },
 {
  id:'tough-find-the-protected-pocket',title:'Find the protected pocket',difficulty:'tough',planSteps:4,revision:2,theme:'through-ball',side:'attack',playerTeam:'white',roundLimit:4,
  objective:'Create and take a finish worth at least 20% against the best goalkeeper reaction. Any legal plan can earn credit.',
  coachNote:'The keeper starts centrally on g17. A forward ball to h15 lets the knight collect and then change direction toward j16, away from the king’s immediate challenge. The supporting pawn covers a potential opposing pawn route and the rook restricts the keeper’s forward approach. The final I-file lob is about 23% against the best reaction.',
  hints:['The queen’s initial long shot is weak. A knight can collect into space and still use its separate dribble.','Compare the landing squares with both the king’s bonus step and its normal challenge. The right-hand pocket gives more separation.','One plan is Qh10–h15, Nf14–h15 to collect, Nh15–j16, then the I-goal finish after positioning ends.'],
  goal:{type:'finish',minShotXG:.20},
  position:{pieces:[piece('white-K',6,16),piece('black-K',6,0),piece('black-R1',13,0),piece('black-R2',0,0),piece('black-B1',11,1),piece('black-N1',1,8),piece('black-P1',6,3),piece('white-P1',5,7),piece('white-P2',9,8),piece('white-B2',10,9),piece('white-N2',2,10),piece('white-Q',7,7),piece('white-N1',5,3),piece('white-R1',6,1),piece('white-P3',6,2),piece('white-B1',2,5)],carrierId:'white-Q',phase:'kick',attack:'white'},
  exampleActions:[kick(7,2),move('white-N1',7,2),move('white-N1',9,1),skip(),kick(8,-1)]
 },
 {
  id:'tough-clear-the-delivery-diagonal',title:'Switch around the central screen',difficulty:'tough',planSteps:3,revision:3,theme:'box-entry',side:'attack',playerTeam:'white',roundLimit:4,
  objective:'Create and take a finish worth at least 20% against the best goalkeeper reaction. Any legal plan can earn credit.',
  coachNote:'The goalkeeper begins centrally on g17. Two defenders screen the queen’s direct i-file attempt, while a friendly bishop interrupts the diagonal to the far-side knight. Clearing that diagonal changes the point of attack rather than relying on a keeper stranded outside its goal. The illustrated delivery creates about a 23% F-file lob.',
  hints:['The direct i-file shot has two defensive bodies in front of it. The opposite-side knight offers another angle.','Clear the friendly bishop off the queen–knight diagonal while keeping the receiver onside.','One route is Bg14–h15, Qi12–Ne16, then the knight’s F-goal finish. End positioning as required and answer the actual defensive replies.'],
  goal:{type:'finish',minShotXG:.20},
  position:{pieces:[...attackingSupport(),piece('white-Q',8,5),piece('white-N1',4,1),piece('white-B1',6,3)],carrierId:'white-Q',phase:'attackMove',attack:'white'},
  exampleActions:[move('white-B1',7,2),skip(),kick(4,1),skip(),kick(5,-1)]
 },
 {
  id:'tough-pawn-screen-keeper-route',title:'Two screens and the keeper',difficulty:'tough',planSteps:3,revision:3,theme:'defence',side:'defence',playerTeam:'white',roundLimit:3,
  objective:'Hold the opponent’s finishing chance to 7% or less, or win possession. Any legal defensive plan can earn credit.',
  coachNote:'The keeper begins centrally on g1. The knights and bishop contain the carrier’s escape routes; adding a rook screen and a separate pawn screen lets the keeper cover the declared aim behind two bodies. This reduces the initial immediate threat from about 19% to about 6%. One screen or keeper cover alone is not enough for this target.',
  hints:['The goalkeeper is already in a normal position, but one cover layer still leaves too much danger.','Use the ordinary action for one body screen and the shared pawn bonus for another, leaving the separate keeper reaction available.','One plan is Rg4–h4, Pg2–h2 as the bonus, then Kg1–h1 when the shot is declared. Reversing the two screens also works.'],
  goal:{type:'defend',maxOpponentShotXG:.07},
  position:{pieces:[piece('black-K',7,0),piece('black-R1',13,7),piece('black-Q',0,5),piece('black-B1',2,4),piece('black-N1',11,6),piece('black-P1',4,8),piece('white-Q',10,8),piece('white-R1',6,13),piece('white-B1',7,11),piece('white-N1',6,12),piece('white-N2',8,12),piece('white-P2',9,9),piece('white-K',6,16),piece('black-R2',7,12),piece('white-P1',6,15)],carrierId:'black-R2',phase:'defendMove',attack:'black'},
  exampleActions:[move('white-R1',7,13),move('white-P1',7,15,true),move('white-K',7,16)]
 }
];
