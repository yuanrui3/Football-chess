/** Medium studies with naturally set goalkeepers. Examples are illustrative; grading is outcome-based. */
export const MEDIUM_EXERCISES = [
  {
    "id": "medium-clear-file",
    "title": "Clear the rook’s approach",
    "theme": "one-on-one",
    "side": "attack",
    "playerTeam": "white",
    "roundLimit": 4,
    "position": {
      "pieces": [
        {
          "id": "white-K",
          "team": "white",
          "type": "K",
          "x": 6,
          "y": 16
        },
        {
          "id": "black-K",
          "team": "black",
          "type": "K",
          "x": 7,
          "y": 0
        },
        {
          "id": "white-P1",
          "team": "white",
          "type": "P",
          "x": 5,
          "y": 7
        },
        {
          "id": "white-P2",
          "team": "white",
          "type": "P",
          "x": 8,
          "y": 7
        },
        {
          "id": "white-B2",
          "team": "white",
          "type": "B",
          "x": 0,
          "y": 8
        },
        {
          "id": "black-P1",
          "team": "black",
          "type": "P",
          "x": 12,
          "y": 1
        },
        {
          "id": "black-P2",
          "team": "black",
          "type": "P",
          "x": 11,
          "y": 5
        },
        {
          "id": "black-N1",
          "team": "black",
          "type": "N",
          "x": 11,
          "y": 4
        },
        {
          "id": "black-B1",
          "team": "black",
          "type": "B",
          "x": 12,
          "y": 9
        },
        {
          "id": "black-R1",
          "team": "black",
          "type": "R",
          "x": 13,
          "y": 10
        },
        {
          "id": "white-R1",
          "team": "white",
          "type": "R",
          "x": 8,
          "y": 6
        },
        {
          "id": "white-B1",
          "team": "white",
          "type": "B",
          "x": 8,
          "y": 5
        }
      ],
      "carrierId": "white-R1",
      "phase": "attackMove",
      "attack": "white"
    },
    "exampleActions": [
      {
        "type": "move",
        "pieceId": "white-B1",
        "x": 9,
        "y": 4
      },
      {
        "type": "move",
        "pieceId": "white-R1",
        "x": 8,
        "y": 3
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 8,
        "y": -1
      }
    ],
    "goal": {
      "type": "finish",
      "minShotXG": 0.2
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create a finish worth at least 20%. Any legal plan meeting the target earns credit.",
    "coachNote": "The goalkeeper starts centrally on h17. Clearing the friendly bishop opens a shorter carrying route for the rook; an i14 finish is worth about 22% against the best reply. The 20% target rewards the improved distance, not an abandoned goal.",
    "hints": [
      "The keeper is properly set. Improve the rook’s position before shooting.",
      "The friendly bishop occupies the rook’s forward file. Use the ordinary move to clear it, keeping the dribble available.",
      "One plan is Bi12–j13, Ri11–i14, then the I-goal shot after ending positioning."
    ],
    "revision": 2
  },
  {
    "id": "medium-cross-carry",
    "title": "Switch wide, drive inside",
    "theme": "box-entry",
    "side": "attack",
    "playerTeam": "white",
    "roundLimit": 4,
    "position": {
      "pieces": [
        {
          "id": "white-K",
          "team": "white",
          "type": "K",
          "x": 6,
          "y": 16
        },
        {
          "id": "black-K",
          "team": "black",
          "type": "K",
          "x": 5,
          "y": 0
        },
        {
          "id": "white-P1",
          "team": "white",
          "type": "P",
          "x": 5,
          "y": 7
        },
        {
          "id": "white-P2",
          "team": "white",
          "type": "P",
          "x": 8,
          "y": 7
        },
        {
          "id": "white-B2",
          "team": "white",
          "type": "B",
          "x": 0,
          "y": 8
        },
        {
          "id": "black-P1",
          "team": "black",
          "type": "P",
          "x": 12,
          "y": 1
        },
        {
          "id": "black-P2",
          "team": "black",
          "type": "P",
          "x": 11,
          "y": 5
        },
        {
          "id": "black-N1",
          "team": "black",
          "type": "N",
          "x": 11,
          "y": 4
        },
        {
          "id": "black-B1",
          "team": "black",
          "type": "B",
          "x": 12,
          "y": 9
        },
        {
          "id": "black-R1",
          "team": "black",
          "type": "R",
          "x": 13,
          "y": 10
        },
        {
          "id": "white-R1",
          "team": "white",
          "type": "R",
          "x": 1,
          "y": 4
        },
        {
          "id": "white-Q",
          "team": "white",
          "type": "Q",
          "x": 10,
          "y": 4
        }
      ],
      "carrierId": "white-R1",
      "phase": "kick",
      "attack": "white"
    },
    "exampleActions": [
      {
        "type": "kick",
        "x": 10,
        "y": 4
      },
      {
        "type": "move",
        "pieceId": "white-Q",
        "x": 8,
        "y": 2
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 8,
        "y": -1
      }
    ],
    "goal": {
      "type": "finish",
      "minShotXG": 0.25
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create a finish worth at least 25%. Any legal plan meeting the target earns credit.",
    "coachNote": "The keeper shades the near post on f17 while the ball is on the b-file. A long switch changes the angle of attack; the queen can then carry into an i15 pocket and create about 29%. The 25% target can also be reached by another sufficiently strong legal continuation.",
    "hints": [
      "Width is useful when the ball changes the point of attack.",
      "Switch to the queen on k13, then look for an inward diagonal carry that stays away from the keeper’s immediate challenge.",
      "One plan is Rb13–Qk13, Qk13–i15, then the I-goal finish."
    ],
    "revision": 2
  },
  {
    "id": "medium-diagonal-carry",
    "title": "Launch diagonally, finish at the edge",
    "theme": "one-on-one",
    "side": "attack",
    "playerTeam": "white",
    "roundLimit": 4,
    "position": {
      "pieces": [
        {
          "id": "white-K",
          "team": "white",
          "type": "K",
          "x": 6,
          "y": 16
        },
        {
          "id": "black-K",
          "team": "black",
          "type": "K",
          "x": 6,
          "y": 0
        },
        {
          "id": "white-P1",
          "team": "white",
          "type": "P",
          "x": 5,
          "y": 7
        },
        {
          "id": "white-P2",
          "team": "white",
          "type": "P",
          "x": 8,
          "y": 7
        },
        {
          "id": "white-B2",
          "team": "white",
          "type": "B",
          "x": 0,
          "y": 8
        },
        {
          "id": "black-P1",
          "team": "black",
          "type": "P",
          "x": 12,
          "y": 1
        },
        {
          "id": "black-P2",
          "team": "black",
          "type": "P",
          "x": 11,
          "y": 5
        },
        {
          "id": "black-N1",
          "team": "black",
          "type": "N",
          "x": 11,
          "y": 4
        },
        {
          "id": "black-B1",
          "team": "black",
          "type": "B",
          "x": 12,
          "y": 9
        },
        {
          "id": "black-R1",
          "team": "black",
          "type": "R",
          "x": 13,
          "y": 10
        },
        {
          "id": "white-B1",
          "team": "white",
          "type": "B",
          "x": 3,
          "y": 14
        },
        {
          "id": "white-Q",
          "team": "white",
          "type": "Q",
          "x": 11,
          "y": 6
        }
      ],
      "carrierId": "white-B1",
      "phase": "kick",
      "attack": "white"
    },
    "exampleActions": [
      {
        "type": "kick",
        "x": 11,
        "y": 6
      },
      {
        "type": "move",
        "pieceId": "white-Q",
        "x": 8,
        "y": 3
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 8,
        "y": -1
      }
    ],
    "goal": {
      "type": "finish",
      "minShotXG": 0.2
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create a finish worth at least 20%. Any legal plan meeting the target earns credit.",
    "coachNote": "The keeper remains central on g17. The bishop’s accurate diagonal launch reaches the wide queen; a carry to i14 produces about 22% while staying beyond an immediate king tackle. The 20% target reflects a covered but worthwhile box-edge finish.",
    "hints": [
      "The bishop has no direct finish. Find the queen on its long diagonal.",
      "After receiving, the queen can change the angle before the defender’s positioning reply.",
      "One plan is Bd3–Ql11, Ql11–i14, then the I-goal shot."
    ],
    "revision": 2
  },
  {
    "id": "medium-rook-relay",
    "title": "Hand the file to the forward rook",
    "theme": "one-on-one",
    "side": "attack",
    "playerTeam": "white",
    "roundLimit": 4,
    "position": {
      "pieces": [
        {
          "id": "white-K",
          "team": "white",
          "type": "K",
          "x": 6,
          "y": 16
        },
        {
          "id": "black-K",
          "team": "black",
          "type": "K",
          "x": 7,
          "y": 0
        },
        {
          "id": "white-P1",
          "team": "white",
          "type": "P",
          "x": 5,
          "y": 7
        },
        {
          "id": "white-P2",
          "team": "white",
          "type": "P",
          "x": 8,
          "y": 7
        },
        {
          "id": "white-B2",
          "team": "white",
          "type": "B",
          "x": 0,
          "y": 8
        },
        {
          "id": "black-P1",
          "team": "black",
          "type": "P",
          "x": 12,
          "y": 1
        },
        {
          "id": "black-P2",
          "team": "black",
          "type": "P",
          "x": 11,
          "y": 5
        },
        {
          "id": "black-N1",
          "team": "black",
          "type": "N",
          "x": 11,
          "y": 4
        },
        {
          "id": "black-B1",
          "team": "black",
          "type": "B",
          "x": 2,
          "y": 9
        },
        {
          "id": "black-R1",
          "team": "black",
          "type": "R",
          "x": 13,
          "y": 10
        },
        {
          "id": "white-R1",
          "team": "white",
          "type": "R",
          "x": 8,
          "y": 6
        },
        {
          "id": "white-R2",
          "team": "white",
          "type": "R",
          "x": 8,
          "y": 4
        },
        {
          "id": "white-Q",
          "team": "white",
          "type": "Q",
          "x": 4,
          "y": 5
        }
      ],
      "carrierId": "white-R1",
      "phase": "kick",
      "attack": "white"
    },
    "exampleActions": [
      {
        "type": "kick",
        "x": 8,
        "y": 4
      },
      {
        "type": "move",
        "pieceId": "white-R2",
        "x": 8,
        "y": 3
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 8,
        "y": -1
      }
    ],
    "goal": {
      "type": "finish",
      "minShotXG": 0.2
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create a finish worth at least 20%. Any legal plan meeting the target earns credit.",
    "coachNote": "Both keepers start centrally. The forward rook receives on i13 and advances to the edge of the box on i14, producing about 22% against a set keeper. The rear rook’s initial shot is weaker than the 20% objective; another sound handover or finish can also earn credit.",
    "hints": [
      "The forward rook is a closer shooting platform on the same file.",
      "A teammate receipt leaves its separate dribble available. The queen is behind the ball and does not invite an offside trap.",
      "One route is Ri11–Ri13, Ri13–i14, then the I-goal shot after positioning."
    ],
    "revision": 3
  },
  {
    "id": "medium-pawn-clear",
    "title": "Clear the pawn, keep a safe distance",
    "theme": "one-on-one",
    "side": "attack",
    "playerTeam": "white",
    "roundLimit": 4,
    "position": {
      "pieces": [
        {
          "id": "white-K",
          "team": "white",
          "type": "K",
          "x": 6,
          "y": 16
        },
        {
          "id": "black-K",
          "team": "black",
          "type": "K",
          "x": 7,
          "y": 0
        },
        {
          "id": "white-P1",
          "team": "white",
          "type": "P",
          "x": 5,
          "y": 7
        },
        {
          "id": "white-B2",
          "team": "white",
          "type": "B",
          "x": 0,
          "y": 8
        },
        {
          "id": "black-P1",
          "team": "black",
          "type": "P",
          "x": 12,
          "y": 1
        },
        {
          "id": "black-P2",
          "team": "black",
          "type": "P",
          "x": 11,
          "y": 5
        },
        {
          "id": "black-N1",
          "team": "black",
          "type": "N",
          "x": 11,
          "y": 4
        },
        {
          "id": "black-B1",
          "team": "black",
          "type": "B",
          "x": 12,
          "y": 9
        },
        {
          "id": "black-R1",
          "team": "black",
          "type": "R",
          "x": 13,
          "y": 10
        },
        {
          "id": "white-P2",
          "team": "white",
          "type": "P",
          "x": 7,
          "y": 3
        },
        {
          "id": "white-Q",
          "team": "white",
          "type": "Q",
          "x": 7,
          "y": 4
        }
      ],
      "carrierId": "white-Q",
      "phase": "attackMove",
      "attack": "white"
    },
    "exampleActions": [
      {
        "type": "move",
        "pieceId": "white-P2",
        "x": 8,
        "y": 3,
        "freePawn": true
      },
      {
        "type": "move",
        "pieceId": "white-Q",
        "x": 7,
        "y": 3
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 7,
        "y": -1
      }
    ],
    "goal": {
      "type": "finish",
      "minShotXG": 0.2
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create a finish worth at least 20%. Any legal plan meeting the target earns credit.",
    "coachNote": "The goalkeeper starts centrally on h17. Moving the pawn opens h14 for the queen; stopping at the box edge avoids a guaranteed close-range king challenge and creates about 23%. The 20% target rewards space and support rather than keeper displacement.",
    "hints": [
      "The friendly pawn occupies the useful next carrying square.",
      "Use the shared pawn bonus before dribbling. The queen does not need to enter the deepest part of the box.",
      "One plan is Ph14–i14 as the bonus, Qh13–h14, then the H-goal shot."
    ],
    "revision": 2
  },
  {
    "id": "medium-through-collect-finish",
    "title": "Lead the rook through the line",
    "theme": "through-ball",
    "side": "attack",
    "playerTeam": "white",
    "roundLimit": 4,
    "position": {
      "pieces": [
        {
          "id": "white-K",
          "team": "white",
          "type": "K",
          "x": 6,
          "y": 16
        },
        {
          "id": "black-K",
          "team": "black",
          "type": "K",
          "x": 6,
          "y": 0
        },
        {
          "id": "white-P1",
          "team": "white",
          "type": "P",
          "x": 5,
          "y": 7
        },
        {
          "id": "white-P2",
          "team": "white",
          "type": "P",
          "x": 8,
          "y": 7
        },
        {
          "id": "white-B2",
          "team": "white",
          "type": "B",
          "x": 0,
          "y": 8
        },
        {
          "id": "black-P1",
          "team": "black",
          "type": "P",
          "x": 12,
          "y": 1
        },
        {
          "id": "black-P2",
          "team": "black",
          "type": "P",
          "x": 11,
          "y": 5
        },
        {
          "id": "black-N1",
          "team": "black",
          "type": "N",
          "x": 11,
          "y": 4
        },
        {
          "id": "black-B1",
          "team": "black",
          "type": "B",
          "x": 4,
          "y": 5
        },
        {
          "id": "black-R1",
          "team": "black",
          "type": "R",
          "x": 13,
          "y": 10
        },
        {
          "id": "white-B1",
          "team": "white",
          "type": "B",
          "x": 1,
          "y": 7
        },
        {
          "id": "white-R1",
          "team": "white",
          "type": "R",
          "x": 5,
          "y": 5
        }
      ],
      "carrierId": "white-B1",
      "phase": "kick",
      "attack": "white"
    },
    "exampleActions": [
      {
        "type": "kick",
        "x": 5,
        "y": 3
      },
      {
        "type": "move",
        "pieceId": "white-R1",
        "x": 5,
        "y": 3
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 5,
        "y": -1
      }
    ],
    "goal": {
      "type": "finish",
      "minShotXG": 0.2
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create a finish worth at least 20%. Any legal plan meeting the target earns credit.",
    "coachNote": "The central g17 keeper faces a genuine forward delivery. The rook collects in space beyond the nearby bishop’s line and shoots from f14, where the best keeper reply leaves about 22%. The 20% target accepts any legal plan of comparable quality.",
    "hints": [
      "Send the bishop’s pass into empty space, not onto the rook’s present square.",
      "The rook can collect up its own file while staying onside at release.",
      "One plan is Bb10–f14, Rf12–f14 to collect, then the F-goal finish after positioning."
    ],
    "revision": 2
  },
  {
    "id": "medium-clear-and-carry",
    "title": "Clear the diagonal runway",
    "theme": "one-on-one",
    "side": "attack",
    "playerTeam": "white",
    "roundLimit": 4,
    "position": {
      "pieces": [
        {
          "id": "white-K",
          "team": "white",
          "type": "K",
          "x": 6,
          "y": 16
        },
        {
          "id": "black-K",
          "team": "black",
          "type": "K",
          "x": 7,
          "y": 0
        },
        {
          "id": "white-P1",
          "team": "white",
          "type": "P",
          "x": 5,
          "y": 7
        },
        {
          "id": "white-P2",
          "team": "white",
          "type": "P",
          "x": 8,
          "y": 7
        },
        {
          "id": "white-B2",
          "team": "white",
          "type": "B",
          "x": 0,
          "y": 8
        },
        {
          "id": "black-P1",
          "team": "black",
          "type": "P",
          "x": 12,
          "y": 1
        },
        {
          "id": "black-P2",
          "team": "black",
          "type": "P",
          "x": 11,
          "y": 5
        },
        {
          "id": "black-N1",
          "team": "black",
          "type": "N",
          "x": 11,
          "y": 4
        },
        {
          "id": "black-B1",
          "team": "black",
          "type": "B",
          "x": 12,
          "y": 9
        },
        {
          "id": "black-R1",
          "team": "black",
          "type": "R",
          "x": 13,
          "y": 10
        },
        {
          "id": "white-Q",
          "team": "white",
          "type": "Q",
          "x": 10,
          "y": 5
        },
        {
          "id": "white-B1",
          "team": "white",
          "type": "B",
          "x": 9,
          "y": 4
        }
      ],
      "carrierId": "white-Q",
      "phase": "attackMove",
      "attack": "white"
    },
    "exampleActions": [
      {
        "type": "move",
        "pieceId": "white-B1",
        "x": 8,
        "y": 5
      },
      {
        "type": "move",
        "pieceId": "white-Q",
        "x": 8,
        "y": 3
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 8,
        "y": -1
      }
    ],
    "goal": {
      "type": "finish",
      "minShotXG": 0.2
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create a finish worth at least 20%. Any legal plan meeting the target earns credit.",
    "coachNote": "The keeper starts naturally on h17. The bishop interrupts the queen’s diagonal route to i14; clearing it makes a22% box-edge finish possible. The 20% target leaves room for other safe carrying routes and useful support moves.",
    "hints": [
      "The queen has a useful inward carrying diagonal, interrupted by its own bishop.",
      "Clear the bishop with the ordinary move, preserving the queen’s dribble.",
      "One plan is Bj13–i12, Qk12–i14, then the I-goal shot."
    ],
    "revision": 2
  },
  {
    "id": "medium-queen-through-collection",
    "title": "Collect at the edge of the box",
    "theme": "through-ball",
    "side": "attack",
    "playerTeam": "white",
    "roundLimit": 4,
    "position": {
      "pieces": [
        {
          "id": "white-K",
          "team": "white",
          "type": "K",
          "x": 6,
          "y": 16
        },
        {
          "id": "black-K",
          "team": "black",
          "type": "K",
          "x": 6,
          "y": 0
        },
        {
          "id": "white-P1",
          "team": "white",
          "type": "P",
          "x": 5,
          "y": 7
        },
        {
          "id": "white-P2",
          "team": "white",
          "type": "P",
          "x": 8,
          "y": 7
        },
        {
          "id": "white-B2",
          "team": "white",
          "type": "B",
          "x": 0,
          "y": 8
        },
        {
          "id": "black-P1",
          "team": "black",
          "type": "P",
          "x": 12,
          "y": 1
        },
        {
          "id": "black-P2",
          "team": "black",
          "type": "P",
          "x": 11,
          "y": 5
        },
        {
          "id": "black-N1",
          "team": "black",
          "type": "N",
          "x": 11,
          "y": 4
        },
        {
          "id": "black-B1",
          "team": "black",
          "type": "B",
          "x": 6,
          "y": 7
        },
        {
          "id": "black-R1",
          "team": "black",
          "type": "R",
          "x": 13,
          "y": 10
        },
        {
          "id": "white-B1",
          "team": "white",
          "type": "B",
          "x": 3,
          "y": 8
        },
        {
          "id": "white-Q",
          "team": "white",
          "type": "Q",
          "x": 10,
          "y": 5
        }
      ],
      "carrierId": "white-B1",
      "phase": "kick",
      "attack": "white"
    },
    "exampleActions": [
      {
        "type": "kick",
        "x": 8,
        "y": 3
      },
      {
        "type": "move",
        "pieceId": "white-Q",
        "x": 8,
        "y": 3
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 8,
        "y": -1
      }
    ],
    "goal": {
      "type": "finish",
      "minShotXG": 0.2
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create a finish worth at least 20%. Any legal plan meeting the target earns credit.",
    "coachNote": "The keeper starts centrally on g17 rather than at an artificial far post. The bishop leads an onside queen into i14; collecting and shooting there creates about 22%. The 20% objective accepts a different legal route if it makes an equally useful finish.",
    "hints": [
      "The distributor has no direct goal line. Look for a diagonal leading pass.",
      "The queen can collect the ball at the box edge without dribbling into an immediate keeper challenge.",
      "One route is Bd9–i14, Qk12–i14 to collect, then the I-goal finish."
    ],
    "revision": 3
  },
  {
    "id": "medium-vacate-receiver-lane",
    "title": "Vacate the finishing pocket",
    "theme": "one-on-one",
    "side": "attack",
    "playerTeam": "white",
    "roundLimit": 4,
    "position": {
      "pieces": [
        {
          "id": "white-K",
          "team": "white",
          "type": "K",
          "x": 6,
          "y": 16
        },
        {
          "id": "black-K",
          "team": "black",
          "type": "K",
          "x": 7,
          "y": 0
        },
        {
          "id": "white-P1",
          "team": "white",
          "type": "P",
          "x": 5,
          "y": 7
        },
        {
          "id": "white-P2",
          "team": "white",
          "type": "P",
          "x": 8,
          "y": 7
        },
        {
          "id": "white-B2",
          "team": "white",
          "type": "B",
          "x": 0,
          "y": 8
        },
        {
          "id": "black-P1",
          "team": "black",
          "type": "P",
          "x": 12,
          "y": 1
        },
        {
          "id": "black-P2",
          "team": "black",
          "type": "P",
          "x": 11,
          "y": 5
        },
        {
          "id": "black-N1",
          "team": "black",
          "type": "N",
          "x": 11,
          "y": 4
        },
        {
          "id": "black-B1",
          "team": "black",
          "type": "B",
          "x": 12,
          "y": 9
        },
        {
          "id": "black-R1",
          "team": "black",
          "type": "R",
          "x": 13,
          "y": 10
        },
        {
          "id": "white-Q",
          "team": "white",
          "type": "Q",
          "x": 10,
          "y": 5
        },
        {
          "id": "white-R1",
          "team": "white",
          "type": "R",
          "x": 8,
          "y": 3
        }
      ],
      "carrierId": "white-Q",
      "phase": "attackMove",
      "attack": "white"
    },
    "exampleActions": [
      {
        "type": "move",
        "pieceId": "white-R1",
        "x": 10,
        "y": 3
      },
      {
        "type": "move",
        "pieceId": "white-Q",
        "x": 8,
        "y": 3
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 8,
        "y": -1
      }
    ],
    "goal": {
      "type": "finish",
      "minShotXG": 0.2
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create a finish worth at least 20%. Any legal plan meeting the target earns credit.",
    "coachNote": "The goalkeeper is set on h17. A teammate currently occupies i14, so vacating that pocket lets the queen carry in and create about 22%. The 20% outcome does not require the example rook destination or a particular pass count.",
    "hints": [
      "The best receiving pocket is occupied by a friendly rook.",
      "Move that rook away with the ordinary action, then use the queen’s separate dribble.",
      "One plan is Ri14–k14, Qk12–i14, then the I-goal shot."
    ],
    "revision": 2
  },
  {
    "id": "medium-def-screen-rook",
    "title": "Screen and react from the centre",
    "theme": "defence",
    "side": "defence",
    "playerTeam": "white",
    "roundLimit": 4,
    "position": {
      "pieces": [
        {
          "id": "black-K",
          "team": "black",
          "type": "K",
          "x": 7,
          "y": 0
        },
        {
          "id": "black-N1",
          "team": "black",
          "type": "N",
          "x": 3,
          "y": 12
        },
        {
          "id": "black-B1",
          "team": "black",
          "type": "B",
          "x": 9,
          "y": 11
        },
        {
          "id": "black-R1",
          "team": "black",
          "type": "R",
          "x": 12,
          "y": 10
        },
        {
          "id": "white-B1",
          "team": "white",
          "type": "B",
          "x": 2,
          "y": 10
        },
        {
          "id": "white-P1",
          "team": "white",
          "type": "P",
          "x": 1,
          "y": 12
        },
        {
          "id": "white-P2",
          "team": "white",
          "type": "P",
          "x": 12,
          "y": 14
        },
        {
          "id": "white-N1",
          "team": "white",
          "type": "N",
          "x": 4,
          "y": 10
        },
        {
          "id": "white-K",
          "team": "white",
          "type": "K",
          "x": 6,
          "y": 16
        },
        {
          "id": "black-Q",
          "team": "black",
          "type": "Q",
          "x": 7,
          "y": 12
        },
        {
          "id": "white-R1",
          "team": "white",
          "type": "R",
          "x": 1,
          "y": 14
        }
      ],
      "carrierId": "black-Q",
      "phase": "defendMove",
      "attack": "black"
    },
    "exampleActions": [
      {
        "type": "move",
        "pieceId": "white-R1",
        "x": 7,
        "y": 14
      },
      {
        "type": "skip"
      },
      {
        "type": "move",
        "pieceId": "white-K",
        "x": 7,
        "y": 16
      }
    ],
    "goal": {
      "type": "defend",
      "maxOpponentShotXG": 0.12
    },
    "difficulty": "medium",
    "planSteps": 2,
    "objective": "Win possession or hold the strongest immediate finish to 12% or less. Any legal defence can earn credit.",
    "coachNote": "The keeper starts naturally on g1. The rook’s weighted retreat puts a body on the h-file; the keeper can then react one square to h1 when the aim is declared. These two coordinated decisions reduce the threat to about 10.5%, below the 12% target.",
    "hints": [
      "The queen’s h-file shot needs both a screen and a keeper response.",
      "The rook can retreat across the third rank using its full weighted movement allowance.",
      "One plan is Rb3–h3, end defending positioning, then Kg1–h1 against the declared H shot."
    ],
    "revision": 2
  },
  {
    "id": "medium-def-screen-bishop",
    "title": "Close the diagonal gate",
    "theme": "defence",
    "side": "defence",
    "playerTeam": "white",
    "roundLimit": 4,
    "position": {
      "pieces": [
        {
          "id": "black-K",
          "team": "black",
          "type": "K",
          "x": 7,
          "y": 0
        },
        {
          "id": "black-N1",
          "team": "black",
          "type": "N",
          "x": 3,
          "y": 12
        },
        {
          "id": "black-B1",
          "team": "black",
          "type": "B",
          "x": 9,
          "y": 11
        },
        {
          "id": "black-R1",
          "team": "black",
          "type": "R",
          "x": 12,
          "y": 10
        },
        {
          "id": "white-P1",
          "team": "white",
          "type": "P",
          "x": 1,
          "y": 12
        },
        {
          "id": "white-P2",
          "team": "white",
          "type": "P",
          "x": 12,
          "y": 14
        },
        {
          "id": "white-N1",
          "team": "white",
          "type": "N",
          "x": 3,
          "y": 10
        },
        {
          "id": "white-K",
          "team": "white",
          "type": "K",
          "x": 6,
          "y": 16
        },
        {
          "id": "black-Q",
          "team": "black",
          "type": "Q",
          "x": 8,
          "y": 12
        },
        {
          "id": "white-B1",
          "team": "white",
          "type": "B",
          "x": 12,
          "y": 11
        }
      ],
      "carrierId": "black-Q",
      "phase": "defendMove",
      "attack": "black"
    },
    "exampleActions": [
      {
        "type": "move",
        "pieceId": "white-B1",
        "x": 8,
        "y": 15
      },
      {
        "type": "move",
        "pieceId": "white-K",
        "x": 7,
        "y": 16,
        "freePawn": true
      },
      {
        "type": "move",
        "pieceId": "white-K",
        "x": 8,
        "y": 16
      }
    ],
    "goal": {
      "type": "defend",
      "maxOpponentShotXG": 0.1
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Win possession or hold the strongest immediate finish to 10% or less. Any legal defence can earn credit.",
    "coachNote": "The keeper begins centrally on g1. A bishop screen on i2 combines with a shared king step to h1 and a later reaction to i1, leaving about 8.7%. The 10% target can also be met by another legal defensive plan.",
    "hints": [
      "The dangerous aim is the i-file, two files from the keeper.",
      "The bishop can reach the shooting line diagonally while the king uses the shared bonus.",
      "One plan is Bm6–i2, Kg1–h1 as the bonus, then Kh1–i1 against the shot."
    ]
  },
  {
    "id": "medium-def-sweeper-keeper",
    "title": "Step out and challenge",
    "theme": "defence",
    "side": "defence",
    "playerTeam": "white",
    "roundLimit": 4,
    "position": {
      "pieces": [
        {
          "id": "black-K",
          "team": "black",
          "type": "K",
          "x": 7,
          "y": 0
        },
        {
          "id": "black-N1",
          "team": "black",
          "type": "N",
          "x": 3,
          "y": 12
        },
        {
          "id": "black-B1",
          "team": "black",
          "type": "B",
          "x": 9,
          "y": 11
        },
        {
          "id": "black-R1",
          "team": "black",
          "type": "R",
          "x": 12,
          "y": 10
        },
        {
          "id": "white-B1",
          "team": "white",
          "type": "B",
          "x": 2,
          "y": 10
        },
        {
          "id": "white-P1",
          "team": "white",
          "type": "P",
          "x": 1,
          "y": 12
        },
        {
          "id": "white-P2",
          "team": "white",
          "type": "P",
          "x": 12,
          "y": 14
        },
        {
          "id": "white-N1",
          "team": "white",
          "type": "N",
          "x": 4,
          "y": 10
        },
        {
          "id": "white-K",
          "team": "white",
          "type": "K",
          "x": 7,
          "y": 15
        },
        {
          "id": "black-Q",
          "team": "black",
          "type": "Q",
          "x": 6,
          "y": 13
        },
        {
          "id": "white-R1",
          "team": "white",
          "type": "R",
          "x": 12,
          "y": 13
        }
      ],
      "carrierId": "black-Q",
      "phase": "defendMove",
      "attack": "black"
    },
    "exampleActions": [
      {
        "type": "move",
        "pieceId": "white-K",
        "x": 7,
        "y": 14,
        "freePawn": true
      },
      {
        "type": "move",
        "pieceId": "white-K",
        "x": 6,
        "y": 14
      }
    ],
    "goal": {
      "type": "defend",
      "maxOpponentShotXG": 0.15
    },
    "difficulty": "medium",
    "planSteps": 2,
    "objective": "Win possession or hold the strongest immediate finish to 15% or less. Any legal defence can earn credit.",
    "coachNote": "The keeper starts one square off its line on h2, a normal proactive position against a nearby attack. A shared step to h3 brings the queen within a clean ordinary challenge. Winning possession completes the defensive outcome; effective shot suppression also counts.",
    "hints": [
      "The keeper is set inside its box and has no immediate tackle yet.",
      "Use the shared king step to close the distance before spending the ordinary challenge.",
      "One plan is Kh2–h3 as the bonus, then challenge Qg4 with a legal landing on g3."
    ],
    "revision": 2
  }
];
