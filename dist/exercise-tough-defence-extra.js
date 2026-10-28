/** Coordinated defensive studies. Native geometry, rather than an answer key, grades the plan. */
const piece=(id,x,y)=>({id,team:id.split('-')[0],type:id.split('-')[1][0],x,y});
const move=(pieceId,x,y,freePawn=false)=>({type:'move',pieceId,x,y,...(freePawn?{freePawn:true}:{})});
export const TOUGH_DEFENCE_EXTRA=[
  {
    id:'tough-open-the-keepers-return',title:'Open the keeper’s return route',difficulty:'tough',planSteps:3,
    theme:'defence',side:'defence',playerTeam:'white',roundLimit:3,
    objective:'Hold the opponent’s finishing chance to 30% or less, or win possession. Any legal defensive plan can earn credit.',
    coachNote:'The keeper starts outside its box, where it has no saving reach or shot reaction. Its own pawn blocks the only adjacent entry; the rook and knight occupy the other entry squares. One plan clears the pawn with the shared bonus so the king can return with its ordinary move and later react. The exercise accepts any legal defence meeting the target.',
    hints:['The keeper is outside its own box. Which friendly piece prevents it returning?','Use the pawn bonus to clear e1, then spend the ordinary move on the king.','One route is Pe1–d1 as the bonus, Kd2–e1, then Ke1–f1 against the rook’s declared F-file shot.'],
    goal:{type:'defend',maxOpponentShotXG:.30},
    position:{pieces:[piece('white-K',3,15),piece('white-P1',4,16),piece('white-R1',4,15),piece('white-N2',4,14),piece('white-N1',9,11),piece('white-B1',2,8),piece('white-Q',10,10),piece('black-K',7,0),piece('black-R1',5,14),piece('black-R2',13,7),piece('black-Q',0,5),piece('black-B1',2,4),piece('black-N1',11,6),piece('black-P1',4,8)],carrierId:'black-R1',phase:'defendMove',attack:'black'},
    exampleActions:[move('white-P1',3,16,true),move('white-K',4,16),move('white-K',5,16)],
  },
  {
    id:'tough-clear-the-box-gateway',title:'Clear the box gateway',difficulty:'tough',planSteps:3,
    theme:'defence',side:'defence',playerTeam:'white',roundLimit:3,
    objective:'Hold the opponent’s finishing chance to 28% or less, or win possession. Any legal defensive plan can earn credit.',
    coachNote:'The king starts outside its own box and e3 is its only adjacent entry. One plan clears the rook with the ordinary action, leaves the shared bonus for the king to enter, and uses the separate goalkeeper reaction to cover the incoming shot. A different route or possession win can also solve the position; the rook clearance is an example, not a grading requirement.',
    hints:['Find the only adjacent square where the king could regain its goalkeeper powers. A friendly rook occupies it.','Move the rook with the ordinary action. Save the shared bonus for the king rather than another pawn.','One route is Re3–d3, Kd4–e3 with the shared bonus, then Ke3–f2 against the rook’s declared F-file shot. Other rook clearances can also work.'],
    goal:{type:'defend',maxOpponentShotXG:.28},
    position:{pieces:[piece('white-K',3,13),piece('white-P1',4,13),piece('white-R1',4,14),piece('white-N2',4,12),piece('white-N1',9,11),piece('white-B1',2,8),piece('white-Q',10,10),piece('black-K',7,0),piece('black-R1',5,13),piece('black-R2',13,7),piece('black-Q',0,5),piece('black-B1',2,4),piece('black-N1',11,6),piece('black-P1',4,8)],carrierId:'black-R1',phase:'defendMove',attack:'black'},
    exampleActions:[move('white-R1',3,14),move('white-K',4,14,true),move('white-K',5,15)],
  },
];
