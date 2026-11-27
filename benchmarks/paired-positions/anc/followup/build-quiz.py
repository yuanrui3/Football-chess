"""Render the public quiz and matched model requests from the frozen pass bank.

Run with Python 3.9+ and Pillow. Only public position fields enter presentation.
"""
import hashlib
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
OUT = HERE / "participant"
QUIZ = "PFC-PASS-X1"
SEED = "PFC-PASS-X1-order-v1"
NAMES = {"K": "king", "Q": "queen", "R": "rook", "B": "bishop", "N": "knight", "P": "pawn"}
TASK = "Which receiver maximizes the probability that your team keeps possession after one defensive challenge?"
HORIZON = (
    "All three passes are legal, onside, unobstructed and reach their receivers with certainty. "
    "Every piece stays on its square after the pass. The attack holds. The defense can hold or make "
    "one ordinary move, and will choose a legal tackle with the highest chance of winning the ball. Fouls are off."
)
RULES = [
    "Rooks tackle on a rank or file, bishops on a diagonal, and queens along either. Their reach is at most five squares. Intervening pieces block these lines.",
    "Knights jump one file and two ranks or two files and one rank. Pawns tackle one diagonal step in any direction. Kings tackle one adjacent square in any direction.",
    "A tackle needs a legal landing next to the receiver, within ten squares of the defender's starting square using the larger of the file and rank differences. The landing must be empty or the defender's own starting square.",
    "Outfield pieces cannot occupy f1–i1 or f17–i17. A king may enter only its own end's penalty box (files e–j and ranks 1–3 for White or 15–17 for Black). White attacks rank 17 and Black attacks rank 1.",
    "A legal tackle wins the ball with probability 1 against a non-knight receiver or 0.5 against a knight receiver. A failed tackle, another move, or holding leaves possession with the attacking team.",
]
LEGEND = "Light pieces are White and dark pieces are Black. The square token carries the ball. Numbers identify receivers. K king, Q queen, R rook, B bishop, N knight, P pawn."


def digest(value):
    return hashlib.sha256(value).hexdigest()


def order_key(namespace, value):
    return digest(f"{SEED}/{namespace}/{value}".encode())


def schedule(pairs):
    assert len(pairs) == 8
    first = sorted(pairs, key=lambda p: order_key("first", p["pairId"]))
    for attempt in range(10_000):
        second = sorted(pairs, key=lambda p: order_key(f"second/{attempt}", p["pairId"]))
        if all(second.index(pair) + 8 - i >= 6 for i, pair in enumerate(first)):
            break
    else:
        raise ValueError("No schedule with five intervening positions")
    def member(pair, index):
        return sorted(pair["items"], key=lambda item: order_key("orientation", item))[index]
    ids = [member(p, 0) for p in first] + [member(p, 1) for p in second]
    assert len(ids) == len(set(ids)) == 16
    return ids


def font(size, bold=False):
    win = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    for name in [win / ("segoeuib.ttf" if bold else "segoeui.ttf"),
                 "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"]:
        try:
            return ImageFont.truetype(str(name), size)
        except OSError:
            continue
    raise RuntimeError("Install Segoe UI or DejaVu Sans to regenerate pitch labels.")


CELL, MARGIN = 52, 37
W, H = 14 * CELL + 2 * MARGIN, 17 * CELL + 2 * MARGIN
INK, PAPER = "#1f3731", "#fcfcf8"


def point(square):
    file, rank = ord(square[0]) - ord("a"), int(square[1:])
    assert 0 <= file < 14 and 1 <= rank <= 17
    return (MARGIN + (file + 0.5) * CELL, MARGIN + (17.5 - rank) * CELL)


def render(board, file):
    im = Image.new("RGB", (W, H), PAPER)
    pen = ImageDraw.Draw(im)
    axis, glyph, badge = font(22), font(29, True), font(14, True)
    for col in range(14):
        x = MARGIN + col * CELL
        letter = chr(ord("a") + col)
        for row in range(17):
            y, rank = MARGIN + row * CELL, 17 - row
            fill = "#e6eddf" if rank % 2 else "#dce7d8"
            if 4 <= col <= 9 and (rank <= 3 or rank >= 15):
                fill = "#d1dfd2"
            if 5 <= col <= 8 and rank in [1, 17]:
                fill = "#b9cfc3"
            pen.rectangle((x, y, x + CELL, y + CELL), fill, outline="#a2b5a5", width=1)
        for y in (MARGIN / 2, H - MARGIN / 2):
            pen.text((x + CELL / 2, y), letter, anchor="mm", font=axis, fill=INK)
    for rank in range(1, 18):
        _, y = point("a" + str(rank))
        for x in (MARGIN / 2, W - MARGIN / 2):
            pen.text((x, y), str(rank), anchor="mm", font=axis, fill=INK)
    pen.rectangle((MARGIN, MARGIN, W - MARGIN, H - MARGIN), outline="#647e70", width=2)
    for piece in board["pieces"]:
        x, y = point(piece["square"])
        light, pid = piece["team"] == "white", piece["id"]
        fill, letter = (PAPER, INK) if light else (INK, "white")
        shape = (x - 19, y - 19, x + 19, y + 19)
        if pid == board["carrier"]:
            pen.rounded_rectangle(shape, radius=6, fill=fill, outline="#15758b", width=4)
        else:
            pen.ellipse(shape, fill=fill, outline=INK, width=2)
        pen.text((x, y - 1), piece["type"], anchor="mm", font=glyph, fill=letter)
        if pid in board["options"]:
            cx, cy = x + 16, y - 16
            pen.rounded_rectangle((cx - 9, cy - 9, cx + 9, cy + 9), radius=4, fill="#804405")
            pen.text((cx, cy - 1), str(board["options"].index(pid) + 1), anchor="mm", font=badge, fill="white")
    im.save(file, optimize=True)


def label(piece):
    return f"{NAMES[piece['type']]} on {piece['square']}"


def task(board):
    pieces = {p["id"]: p for p in board["pieces"]}
    carrier = pieces[board["carrier"]]
    assert carrier["team"] == board["attack"] and carrier["type"] == "Q"
    state = f"{board['attack'].title()}'s {label(carrier)} has the ball."
    rosters = []
    for team in ["white", "black"]:
        squad = sorted((p for p in pieces.values() if p["team"] == team), key=lambda p: (p["type"], p["square"]))
        rosters.append(team.title() + " pieces: " + ", ".join(label(p) for p in squad) + ".")
    options = "\n".join(f"{i}. {label(pieces[pid])}" for i, pid in enumerate(board["options"], 1))
    return "\n\n".join([TASK, HORIZON, state, options, "Answer with one option number (1, 2 or 3).",
                         LEGEND, "\n".join(rosters), "\n".join(RULES)])


def build():
    bank = json.loads((HERE / "bank.json").read_text(encoding="utf8"))
    index = {p["itemId"]: p for p in bank["positions"]}
    images = OUT / "images"
    images.mkdir(parents=True, exist_ok=True)
    items = []
    for serial, id_ in enumerate(schedule(bank["pairs"]), 1):
        board = index[id_]
        assert len(board["options"]) == len(set(board["options"])) == 3
        image = images / f"position-{serial:02d}.png"
        render(board, image)
        prompt = task(board)
        items.append({"itemId": id_, "image": image.relative_to(OUT).as_posix(),
                      "imageSha256": digest(image.read_bytes()), "prompt": prompt,
                      "promptSha256": digest(prompt.encode()), "options": board["options"]})
    data = {"quizId": QUIZ, "items": items}
    pretty = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    (OUT / "items.json").write_bytes(pretty.encode())
    template = (HERE / "quiz-template.html").read_text(encoding="utf8")
    assert template.count("{{QUIZ_JSON}}") == 1
    compact = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    (OUT / "quiz.html").write_bytes(template.replace("{{QUIZ_JSON}}", compact).encode())
    print(f"Built {len(items)} matched items for {QUIZ}.")


if __name__ == "__main__":
    build()
