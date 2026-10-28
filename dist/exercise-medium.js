/** Medium studies: short combinations in larger, contested positions.
 * Examples are illustrative native routes, never prescribed solution strings.
 */
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
    "objective": "Clear the bishop, advance the rook and create a shot worth at least 65%.",
    "coachNote": "The bishop blocks the rook’s file. Clear it with the off-ball action, then use the separate dribble to shorten the long shot before finishing.",
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
      "requires": "box-entry",
      "boxEntryMode": "either"
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Find the wide queen, enter the box and finish at 60% or better.",
    "coachNote": "A lateral pass stretches the attack. The queen must improve the tight starting angle before trying to score.",
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
      "requires": "box-entry",
      "boxEntryMode": "pass"
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Complete the diagonal delivery, evade the keeper’s approach and create an 80% finish.",
    "coachNote": "Receiving close to goal is not sufficient: the queen should step across into a better angle before the keeper closes the declared target.",
    "hints": [
      "The bishop reaches the queen on a long diagonal.",
      "Compare shooting immediately with moving across the front of the keeper.",
      "Bd12–Qh16, then Qh16–i15 and I creates a much stronger chance."
    ]
  },
  {
    "id": "medium-rook-relay",
    "title": "Relay around the pressure",
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
          "x": 1,
          "y": 6
        },
        {
          "id": "white-R2",
          "team": "white",
          "type": "R",
          "x": 1,
          "y": 2
        },
        {
          "id": "white-Q",
          "team": "white",
          "type": "Q",
          "x": 8,
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
        "x": 1,
        "y": 2
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 8,
        "y": 2
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 8,
        "y": -1,
        "disguise": true
      }
    ],
    "goal": {
      "type": "finish",
      "minShotXG": 0.35,
      "minCompletedPasses": 2
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Complete two teammate passes, then create a finish worth at least 35%.",
    "coachNote": "The two rooks link the wing to the central queen. The second pass uses a different direction; watch the knight’s screening reply and consider the disguised finish.",
    "hints": [
      "The deep rook can connect to its partner on the same file.",
      "The advanced rook can then switch the ball across the pitch.",
      "Rb11–Rb15, Rb15–Qi15, then use the queen’s two-target finish."
    ]
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
    "objective": "Clear the pawn, carry into the open file and finish at 25% or better.",
    "coachNote": "The shared bonus frees the queen’s path while leaving its ordinary dribble intact. The queen must stop before the keeper can win a close challenge.",
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
      "minShotXG": 0.4,
      "requires": "through-ball"
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Send a through ball into space, collect with the knight and finish at 40% or better.",
    "coachNote": "The bishop threads a diagonal just beside the defender. The onside knight collects beyond that line and uses its L-shaped finish.",
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
    "objective": "Clear a teammate from the dribbling route, carry centrally and finish at 25% or better.",
    "coachNote": "An off-ball bishop move and the queen’s dribble use separate budgets. Clearing the occupied diagonal gives the queen a central h-file finish.",
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
          "x": 9,
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
          "x": 5,
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
          "id": "white-R1",
          "team": "white",
          "type": "R",
          "x": 6,
          "y": 5
        },
        {
          "id": "white-Q",
          "team": "white",
          "type": "Q",
          "x": 4,
          "y": 3
        }
      ],
      "carrierId": "white-R1",
      "phase": "kick",
      "attack": "white"
    },
    "exampleActions": [
      {
        "type": "kick",
        "x": 6,
        "y": 1
      },
      {
        "type": "move",
        "pieceId": "white-Q",
        "x": 6,
        "y": 1
      },
      {
        "type": "skip"
      },
      {
        "type": "kick",
        "x": 6,
        "y": -1,
        "disguise": true
      }
    ],
    "goal": {
      "type": "finish",
      "minShotXG": 0.55,
      "requires": "through-ball"
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Play a through ball, collect with the queen and create a finish worth at least 55%.",
    "coachNote": "The rook releases the ball before the queen moves beyond the line. A disguised finish can exploit the two goal targets after collection.",
    "hints": [
      "The queen is onside at the moment of release.",
      "The g16 square is both a rook pass target and a queen collection square.",
      "Rg12–g16, Qe14–g16, then disguise the G/I finish."
    ]
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
      "requires": "box-entry",
      "boxEntryMode": "either"
    },
    "difficulty": "medium",
    "planSteps": 3,
    "objective": "Move the rook, carry into the vacated box square and finish at 80% or better.",
    "coachNote": "The rook’s supporting position accidentally blocks the best receiving pocket. Repositioning it opens the queen’s inward diagonal.",
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
    "objective": "Use coordinated cover to win possession or leave a finishing chance of 12% or less.",
    "coachNote": "The rook must account for double-cost box squares: the horizontal move to h3 fits the ten-point budget exactly. The keeper uses its shared bonus before covering H.",
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
    "objective": "Screen the finish and cover its target, leaving 10% or less.",
    "coachNote": "The bishop reaches a screening square diagonally. The keeper needs the shared bonus before its later reaction to cover the i-file.",
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
    "objective": "Win possession with coordinated keeper movement, or hold the finish to 15% or less.",
    "coachNote": "The king can use the shared bonus to approach, then spend the ordinary action tackling. It starts too far away for a direct challenge.",
    "hints": [
      "The king is two squares from the carrier.",
      "The shared bonus can bring it into tackling range without spending the normal action.",
      "Ki2–h3 as the bonus, then tackle Qg4 and land on g3."
    ]
  }
];
