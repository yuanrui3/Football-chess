/** Medium studies: larger positions with outcome-based, non-exclusive teaching lines. */
export const MEDIUM_EXERCISES = [
  {
    "id": "medium-clear-file",
    "title": "Open the rook’s long shot",
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
          "x": 4,
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
      "minShotXG": 0.65
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create and take a finish worth at least 65% against the best legal keeper response. Any legal plan can succeed.",
    "coachNote": "One useful plan: The bishop blocks the rook’s file. Clear it with the off-ball action, then use the separate dribble to shorten the long shot before finishing. Other legal plans that meet the outcome target also earn credit.",
    "hints": [
      "The rook’s file is occupied by a friendly bishop.",
      "Move the bishop away, then advance the ball before shooting.",
      "Bi12–j13 clears Ri11–i14; the I shot is much stronger from there."
    ]
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
          "x": 4,
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
      "minShotXG": 0.6,
      "boxEntryMode": "either"
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create and take a finish worth at least 60% against the best legal keeper response. Any legal plan can succeed.",
    "coachNote": "One useful plan: A lateral pass stretches the attack. The queen can improve the tight starting angle before trying to score. Other legal plans that meet the outcome target also earn credit.",
    "hints": [
      "The rook’s wing position does not give it a goal target.",
      "The queen can receive level with the ball, then carry diagonally inward.",
      "Rb13–Qk13, Qk13–i15 and the I goal form one route."
    ]
  },
  {
    "id": "medium-diagonal-carry",
    "title": "Receive and escape the keeper",
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
          "x": 4,
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
          "y": 5
        },
        {
          "id": "white-Q",
          "team": "white",
          "type": "Q",
          "x": 7,
          "y": 1
        }
      ],
      "carrierId": "white-B1",
      "phase": "kick",
      "attack": "white"
    },
    "exampleActions": [
      {
        "type": "kick",
        "x": 7,
        "y": 1
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
      "minShotXG": 0.8,
      "boxEntryMode": "pass"
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create and take a finish worth at least 80% against the best legal keeper response. Any legal plan can succeed.",
    "coachNote": "One useful plan: Receiving close to goal is not sufficient: the queen should step across into a better angle before the keeper closes the declared target. Other legal plans that meet the outcome target also earn credit.",
    "hints": [
      "The bishop reaches the queen on a long diagonal.",
      "Compare shooting immediately with moving across the front of the keeper.",
      "Bd12–Qh16, then Qh16–i15 and I creates a much stronger chance."
    ]
  },
  {
    "id": "medium-rook-relay",
    "title": "The knight’s cut-back",
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
          "x": 13,
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
          "x": 2,
          "y": 6
        },
        {
          "id": "white-N1",
          "team": "white",
          "type": "N",
          "x": 2,
          "y": 1
        },
        {
          "id": "white-Q",
          "team": "white",
          "type": "Q",
          "x": 4,
          "y": 2
        }
      ],
      "carrierId": "white-R1",
      "phase": "kick",
      "attack": "white"
    },
    "exampleActions": [
      {
        "type": "kick",
        "x": 2,
        "y": 1
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 4,
        "y": 2
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
      "minShotXG": 0.35
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create and take a finish worth at least 35% against the best legal keeper response. Any legal plan can succeed.",
    "coachNote": "One useful plan links the rook, knight and queen before the stranded keeper can return. The knight’s backward L-shaped layoff bypasses straight-line obstructions and keeps the queen behind the ball, so a defensive offside trap cannot exclude the receiver. Any legal route reaching the outcome target earns credit.",
    "hints": [
      "The keeper is away from goal, but the ball still needs a safe legal route to the queen.",
      "The rook reaches the advanced knight. Look for a backward L-shaped layoff: its receiver stays behind the ball.",
      "One route is Rc11–Nc16, Nc16–Qe15, then the diagonal H-goal finish. The route is an illustration, not a required sequence."
    ],
    "revision": 2
  },
  {
    "id": "medium-pawn-clear",
    "title": "Make room with the pawn",
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
          "x": 4,
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
        "y": 2
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
      "minShotXG": 0.25
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create and take a finish worth at least 25% against the best legal keeper response. Any legal plan can succeed.",
    "coachNote": "One useful plan: The shared bonus frees the queen’s path while leaving its ordinary dribble intact. The queen can stop before the keeper can win a close challenge. Other legal plans that meet the outcome target also earn credit.",
    "hints": [
      "The pawn blocks the queen’s straight dribble.",
      "Use the shared bonus to move it sideways.",
      "Ph14–i14 as the bonus, Qh13–h15, then aim at H."
    ]
  },
  {
    "id": "medium-through-collect-finish",
    "title": "Thread the bishop’s pass",
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
          "x": 8,
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
          "y": 3
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
          "y": 5
        },
        {
          "id": "white-N1",
          "team": "white",
          "type": "N",
          "x": 3,
          "y": 2
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
        "y": 1
      },
      {
        "type": "move",
        "pieceId": "white-N1",
        "x": 5,
        "y": 1
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 6,
        "y": -1
      }
    ],
    "goal": {
      "type": "finish",
      "minShotXG": 0.4
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create and take a finish worth at least 40% against the best legal keeper response. Any legal plan can succeed.",
    "coachNote": "One useful plan: The bishop threads a diagonal just beside the defender. The onside knight collects beyond that line and uses its L-shaped finish. Other legal plans that meet the outcome target also earn credit.",
    "hints": [
      "The knight is not the pass destination yet.",
      "Send the ball to the empty f16 square beyond the nearby bishop.",
      "Bb12–f16, Nd15–f16 to collect, then the G target."
    ]
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
          "x": 4,
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
        "x": 7,
        "y": 2
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
      "minShotXG": 0.25
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create and take a finish worth at least 25% against the best legal keeper response. Any legal plan can succeed.",
    "coachNote": "One useful plan: An off-ball bishop move and the queen’s dribble use separate budgets. Clearing the occupied diagonal gives the queen a central h-file finish. Other legal plans that meet the outcome target also earn credit.",
    "hints": [
      "The bishop occupies the queen’s natural inward route.",
      "Move the bishop diagonally away, preserving the queen’s dribble.",
      "Bj13–i12, Qk12–h15, then H."
    ]
  },
  {
    "id": "medium-queen-through-collection",
    "title": "Release the queen into space",
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
          "x": 4,
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
          "y": 3
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
          "y": 5
        },
        {
          "id": "white-Q",
          "team": "white",
          "type": "Q",
          "x": 9,
          "y": 3
        }
      ],
      "carrierId": "white-B1",
      "phase": "kick",
      "attack": "white"
    },
    "exampleActions": [
      {
        "type": "kick",
        "x": 7,
        "y": 1
      },
      {
        "type": "move",
        "pieceId": "white-Q",
        "x": 7,
        "y": 1
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 7,
        "y": -1,
        "disguise": true
      }
    ],
    "goal": {
      "type": "finish",
      "minShotXG": 0.55
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create and take a finish worth at least 55% against the best legal keeper response. Any legal plan can succeed.",
    "coachNote": "One useful plan sends the bishop’s diagonal pass into h16 for an onside queen to collect. The starting bishop has no strong direct goal target; the advanced queen can use either a strong single aim or a two-target finish. Other legal finishes above the target also earn credit.",
    "hints": [
      "Look for a forward diagonal the bishop can deliver beyond the defensive line.",
      "The queen on j14 can collect h16, while remaining onside at the moment of release.",
      "One route is Bd12–h16, Qj14–h16 to collect, then compare F and H or disguise the finish. The suggested theme is optional."
    ],
    "revision": 2
  },
  {
    "id": "medium-vacate-receiver-lane",
    "title": "Vacate the finishing pocket",
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
          "x": 4,
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
          "y": 4
        },
        {
          "id": "white-R1",
          "team": "white",
          "type": "R",
          "x": 8,
          "y": 2
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
        "y": 2
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
      "minShotXG": 0.8,
      "boxEntryMode": "either"
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Create and take a finish worth at least 80% against the best legal keeper response. Any legal plan can succeed.",
    "coachNote": "One useful plan: The rook’s supporting position accidentally blocks the best receiving pocket. Repositioning it opens the queen’s inward diagonal. Other legal plans that meet the outcome target also earn credit.",
    "hints": [
      "A friendly rook occupies the queen’s best box entry.",
      "The rook can move sideways while the queen keeps its separate dribble.",
      "Ri15–k15, Qk13–i15, then I."
    ]
  },
  {
    "id": "medium-def-screen-rook",
    "title": "The rook’s weighted retreat",
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
          "x": 5,
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
        "type": "move",
        "pieceId": "white-K",
        "x": 6,
        "y": 16,
        "freePawn": true
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
    "planSteps": 3,
    "objective": "Win possession, or limit every available immediate finish to 12% or less with sound keeper play. Any legal plan can succeed.",
    "coachNote": "One useful plan: The rook can account for double-cost box squares: the horizontal move to h3 fits the ten-point budget exactly. The keeper uses its shared bonus before covering H. Other legal plans that meet the outcome target also earn credit.",
    "hints": [
      "The black queen threatens the h-file; direct tackling is unavailable.",
      "Combine an outfield screen with keeper positioning.",
      "Rb3–h3 costs ten movement points, Kf1–g1 uses the bonus, then Kg1–h1 reacts to the shot."
    ]
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
    "objective": "Win possession, or limit every available immediate finish to 10% or less with sound keeper play. Any legal plan can succeed.",
    "coachNote": "One useful plan: The bishop reaches a screening square diagonally. The keeper needs the shared bonus before its later reaction to cover the i-file. Other legal plans that meet the outcome target also earn credit.",
    "hints": [
      "The queen’s direct target is I.",
      "The bishop can enter the shooting line from the side.",
      "Bm6–i2, Kg1–h1 as the bonus, then Kh1–i1 when the shot is declared."
    ]
  },
  {
    "id": "medium-def-sweeper-keeper",
    "title": "The keeper’s two-action challenge",
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
          "x": 8,
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
    "objective": "Win possession, or limit every available immediate finish to 15% or less with sound keeper play. Any legal plan can succeed.",
    "coachNote": "One useful plan: The king can use the shared bonus to approach, then spend the ordinary action tackling. It starts too far away for a direct challenge. Other legal plans that meet the outcome target also earn credit.",
    "hints": [
      "The king is two squares from the carrier.",
      "The shared bonus can bring it into tackling range without spending the normal action.",
      "Ki2–h3 as the bonus, then tackle Qg4 and land on g3."
    ]
  }
];
