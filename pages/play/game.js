const HUMAN = "human";
const BOT = "bot";
const BOT_TEST_4 = "test-4";
const BOT_WEIGHTED_4 = "weighted-4";

let BOT_LEVEL = BOT_TEST_4;
let GAME_MODE;

(function () {
  function memoize(f) {
    var memo = {};
    var first = 0;
    var second = 0;
    return function () {
      if (arguments[0] == "stat") return [first, second];
      var key = JSON.stringify(arguments);
      if (memo[key] === undefined) {
        memo[key] = f.apply(this, arguments);
        first++;
      } else {
        second++;
      }
      return memo[key];
    };
  }

  function delay(expressionAsFunction) {
    var result;
    var isEvaluated = false;

    return function () {
      if (!isEvaluated) {
        result = expressionAsFunction();
        isEvaluated = true;
      }
      return result;
    };
  }

  function force(promise) {
    return promise();
  }

  function sum(ns) {
    return ns.reduce(function (t, n) {
      return t + n;
    });
  }

  const N = 8;

  const EMPTY = "empty";
  const WHITE = "white";
  const BLACK = "black";

  function makeInitialGameBoard() {
    var board = {};

    for (var x = 0; x < N; x++)
      for (var y = 0; y < N; y++) board[[x, y]] = EMPTY;

    var x2 = x >> 1;
    var y2 = y >> 1;
    board[[x2 - 1, y2 - 1]] = WHITE;
    board[[x2 - 1, y2 - 0]] = BLACK;
    board[[x2 - 0, y2 - 1]] = BLACK;
    board[[x2 - 0, y2 - 0]] = WHITE;

    return board;
  }

  function makeGameTree(board, player, wasPassed, nest) {
    return {
      board: board,
      player: player,
      moves: listPossibleMoves(board, player, wasPassed, nest),
    };
  }

  function listPossibleMoves(board, player, wasPassed, nest) {
    return completePassingMove(
      listAttackingMoves(board, player, nest),
      board,
      player,
      wasPassed,
      nest
    );
  }

  function completePassingMove(attackingMoves, board, player, wasPassed, nest) {
    if (0 < attackingMoves.length) return attackingMoves;
    else if (!wasPassed)
      return [
        {
          isPassingMove: true,
          gameTreePromise: delay(function () {
            return makeGameTree(board, nextPlayer(player), true, nest + 1);
          }),
        },
      ];
    else return [];
  }

  function listAttackingMoves(board, player, nest) {
    var moves = [];

    for (var x = 0; x < N; x++) {
      for (var y = 0; y < N; y++) {
        var vulnerableCells = listVulnerableCells(board, x, y, player);

        if (canAttack(vulnerableCells)) {
          moves.push({
            x: x,
            y: y,
            gameTreePromise: (function (x, y, vulnerableCells) {
              return delay(function () {
                return makeGameTree(
                  makeAttackedBoard(board, vulnerableCells, player),
                  nextPlayer(player),
                  false,
                  nest + 1
                );
              });
            })(x, y, vulnerableCells),
          });
        }
      }
    }

    return moves;
  }

  function nextPlayer(player) {
    return player == BLACK ? WHITE : BLACK;
  }

  function canAttack(vulnerableCells) {
    return vulnerableCells.length;
  }

  function makeAttackedBoard(board, vulnerableCells, player) {
    var newBoard = JSON.parse(JSON.stringify(board));
    for (i = 0; i < vulnerableCells.length; i++)
      newBoard[vulnerableCells[i]] = player;
    return newBoard;
  }

  function listVulnerableCells(board, x, y, player) {
    var vulnerableCells = [];
    if (board[[x, y]] != EMPTY) return vulnerableCells;

    var opponent = nextPlayer(player);
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        if (dx == 0 && dy == 0) continue;
        for (var i = 1; i < N; i++) {
          var nx = x + i * dx;
          var ny = y + i * dy;
          if (nx < 0 || N <= nx || ny < 0 || N <= ny) break;
          var cell = board[[nx, ny]];
          if (cell == player && 2 <= i) {
            for (j = 0; j < i; j++)
              vulnerableCells.push([x + j * dx, y + j * dy]);
            break;
          }
          if (cell != opponent) break;
        }
      }
    }

    return vulnerableCells;
  }

  // AI {{{1

  function scoreBoardBySimpleCount(board, player) {
    var opponent = nextPlayer(player);
    const blackCount = sum(
      $.map(board, function (v) {
        return v == player;
      })
    );
    const whiteCount = sum(
      $.map(board, function (v) {
        return v == opponent;
      })
    );

    return (
      sum(
        $.map(board, function (v) {
          return v == player;
        })
      ) -
      sum(
        $.map(board, function (v) {
          return v == opponent;
        })
      )
    );
  }

  var weightTable = (function () {
    var t = {};
    for (var x = 0; x < N; x++)
      for (var y = 0; y < N; y++)
        t[[x, y]] =
          (x == 0 || x == N - 1 ? 10 : 1) * (y == 0 || y == N - 1 ? 10 : 1);
    return t;
  })();

  function scoreBoardByWeightedCount(board, player) {
    var opponent = nextPlayer(player);
    var wt = weightTable;
    const blackCount = sum(
      $.map(board, function (v, p) {
        return (v == player) * wt[p];
      })
    );
    const whiteCount = sum(
      $.map(board, function (v, p) {
        return (v == opponent) * wt[p];
      })
    );

    return (
      sum(
        $.map(board, function (v, p) {
          return (v == player) * wt[p];
        })
      ) -
      sum(
        $.map(board, function (v, p) {
          return (v == opponent) * wt[p];
        })
      )
    );
  }

  var aiTable = {
    "test-4": { level: 4, scoreBoard: scoreBoardBySimpleCount },
    "weighted-4": { level: 4, scoreBoard: scoreBoardByWeightedCount },
  };

  function findTheBestMoveByAI(gameTree, playerType) {
    var ai = aiTable[playerType];
    var ratings = calculateMaxRatings(
      limitGameTreeDepth(gameTree, ai.level),
      gameTree.player,
      Number.MIN_VALUE,
      Number.MAX_VALUE,
      ai.scoreBoard
    );
    var maxRating = Math.max.apply(null, ratings);
    return gameTree.moves[ratings.indexOf(maxRating)];
  }

  function limitGameTreeDepth(gameTree, depth) {
    return {
      board: gameTree.board,
      player: gameTree.player,
      moves:
        depth == 0
          ? []
          : gameTree.moves.map(function (m) {
              return {
                isPassingMove: m.isPassingMove,
                x: m.x,
                y: m.y,
                gameTreePromise: delay(function () {
                  return limitGameTreeDepth(
                    force(m.gameTreePromise),
                    depth - 1
                  );
                }),
              };
            }),
    };
  }

  function ratePosition(gameTree, player, scoreBoard) {
    if (1 <= gameTree.moves.length) {
      var choose = gameTree.player == player ? Math.max : Math.min;
      return choose.apply(null, calculateRatings(gameTree, player, scoreBoard));
    } else {
      return scoreBoard(gameTree.board, player);
    }
  }

  function calculateRatings(gameTree, player, scoreBoard) {
    return gameTree.moves.map(function (m) {
      return ratePosition(force(m.gameTreePromise), player, scoreBoard);
    });
  }

  function ratePositionWithAlphaBetaPruning(
    gameTree,
    player,
    lowerLimit,
    upperLimit,
    scoreBoard
  ) {
    if (1 <= gameTree.moves.length) {
      var judge = gameTree.player == player ? Math.max : Math.min;
      var rate =
        gameTree.player == player ? calculateMaxRatings : calculateMinRatings;
      return judge.apply(
        null,
        rate(gameTree, player, lowerLimit, upperLimit, scoreBoard)
      );
    } else {
      return scoreBoard(gameTree.board, player);
    }
  }

  function calculateMaxRatings(
    gameTree,
    player,
    lowerLimit,
    upperLimit,
    scoreBoard
  ) {
    var ratings = [];
    var newLowerLimit = lowerLimit;
    for (var i = 0; i < gameTree.moves.length; i++) {
      var r = ratePositionWithAlphaBetaPruning(
        force(gameTree.moves[i].gameTreePromise),
        player,
        newLowerLimit,
        upperLimit,
        scoreBoard
      );
      ratings.push(r);
      if (upperLimit <= r) break;
      newLowerLimit = Math.max(r, newLowerLimit);
    }
    return ratings;
  }

  function calculateMinRatings(
    gameTree,
    player,
    lowerLimit,
    upperLimit,
    scoreBoard
  ) {
    var ratings = [];
    var newUpperLimit = upperLimit;
    for (var i = 0; i < gameTree.moves.length; i++) {
      var r = ratePositionWithAlphaBetaPruning(
        force(gameTree.moves[i].gameTreePromise),
        player,
        upperLimit,
        newUpperLimit,
        scoreBoard
      );
      ratings.push(r);
      if (r <= lowerLimit) break;
      newUpperLimit = Math.min(r, newUpperLimit);
    }
    return ratings;
  }

  function countPieces(board) {
    var blackCount = 0;
    var whiteCount = 0;

    // Đếm số cờ của mỗi bên trên bảng
    for (var x = 0; x < N; x++) {
      for (var y = 0; y < N; y++) {
        if (board[[x, y]] === BLACK) {
          blackCount++;
        } else if (board[[x, y]] === WHITE) {
          whiteCount++;
        }
      }
    }

    return { black: blackCount, white: whiteCount };
  }

  function updateUIScore(blackCount, whiteCount) {
    document.getElementById("black-score").innerText = `x${blackCount}`;
    document.getElementById("white-score").innerText = `x${whiteCount}`;
  }

  $("#restart").click(function () {
    startNewGame();
  });

  const menu = document.getElementById("preference-pane");
  $("#hamburger").click(function () {
    menu.classList.toggle("hide");
  });

  $("#btn-close").click(function () {
    menu.classList.add("hide");
  });

  $("#resume-button").click(function () {
    menu.classList.add("hide");
  });

  // UI {{{1

  function drawGameBoard(board, player, moves) {
    const { white, black } = countPieces(board);
    updateUIScore(black, white);
    var ss = [];
    var attackable = {};
    moves.forEach(function (m) {
      if (!m.isPassingMove) attackable[[m.x, m.y]] = true;
    });

    ss.push("<table>");
    for (var y = -1; y < N; y++) {
      ss.push("<tr>");
      for (var x = -1; x < N; x++) {
        if (0 <= y && 0 <= x) {
          ss.push('<td class="');
          ss.push("cell");
          ss.push(" ");
          ss.push(attackable[[x, y]] ? player : board[[x, y]]);
          ss.push(" ");
          ss.push(attackable[[x, y]] ? "attackable" : "");
          ss.push('" id="');
          ss.push("cell" + x + y);
          ss.push('">');
          ss.push('<span class="disc"></span>');
          ss.push("</td>");
        }
      }
      ss.push("</tr>");
    }
    ss.push("</table>");

    $("#game-board").html(ss.join(""));

    toggleCurrentPlayer(player);
  }

  function toggleCurrentPlayer(player) {
    const currentPlayerElement = document.getElementById("main");
    currentPlayerElement.setAttribute("player", player);
  }

  function resetUI() {
    $("#console").empty();
    $("#message").empty();
  }

  function setUpUIToChooseMove(gameTree) {
    $("#message").text("Choose your move.");
    gameTree.moves.forEach(function (m, i) {
      if (m.isPassingMove) {
        $("#console").append(
          $('<input type="button" class="btn">')
            .val(makeLabelForMove(m))
            .click(function () {
              shiftToNewGameTree(force(m.gameTreePromise));
            })
        );
      } else {
        $("#cell" + m.x + m.y).click(function () {
          shiftToNewGameTree(force(m.gameTreePromise));
        });
      }
    });
  }

  function makeLabelForMove(move) {
    if (move.isPassingMove) return "Pass";
    else return "abcdefgh"[move.x] + "12345678"[move.y];
  }

  function setUpUIToReset() {
    resetGame();
  }

  function chooseMoveByAI(gameTree, playerType) {
    $("#message").text("Now thinking...");
    setTimeout(function () {
      shiftToNewGameTree(
        force(findTheBestMoveByAI(gameTree, playerType).gameTreePromise)
      );
    }, 100);
  }

  function showModalResult() {
    $("#modal-result").addClass("show");
    // setTimeout(() => {
    //   $("#modal-result").removeClass("show");
    // }, 5000);
    $("#modal-result").click(function () {
      $("#modal-result").removeClass("show");
    });
    $("#modal-content").click(function (e) {
      e.stopPropagation();
    });
  }

  function showWinner(board) {
    showModalResult();

    const { black, white } = countPieces(board);

    $("#white-result-score-count").text(`x${white}`);
    $("#black-result-score-count").text(`x${black}`);

    if (black === white) {
      $("#winner").text("The game ends in a draw.");
    } else if (black > white) {
      $("#winner").text(`${BLACK} THẮNG`);
    } else {
      $("#winner").text(`${WHITE} THẮNG`);
    }
  }

  var playerTypeTable = {};

  function shiftToNewGameTree(gameTree) {
    drawGameBoard(gameTree.board, gameTree.player, gameTree.moves);
    resetUI();
    if (gameTree.moves.length == 0) {
      showWinner(gameTree.board);
      setUpUIToReset();
    } else {
      var playerType = playerTypeTable[gameTree.player];
      if (playerType == "human") setUpUIToChooseMove(gameTree);
      else chooseMoveByAI(gameTree, playerType);
    }
  }

  function resetGame() {
    $("#preference-pane").removeClass("hide");
    $("#preference-pane :input").removeAttr("hide");
  }

  const levelEls = document.querySelectorAll(".level-item");
  const gameModeEls = document.querySelectorAll(".game-mode");

  levelEls[0].classList.add("active");

  gameModeEls.forEach((el) => {
    el.addEventListener("click", function () {
      const activeGameModeEl = document.querySelector(".game-mode.active");
      if (activeGameModeEl) {
        activeGameModeEl.classList.remove("active");
      }
      el.classList.add("active");
      const mode = el.getAttribute("data-mode");
      if (mode === HUMAN) {
        GAME_MODE = mode;
      } else {
        GAME_MODE = BOT_LEVEL;
      }
      startNewGame();
    });
  });

  levelEls.forEach((el) => {
    el.addEventListener("click", function () {
      document.querySelector(".level-item.active").classList.remove("active");
      const _level = el.getAttribute("data-level");
      BOT_LEVEL = _level;
      el.classList.add("active");
    });
  });

  function startNewGame() {
    $("#preference-pane").addClass("hide");
    $("#preference-pane :input").attr("hide", "hide");
    playerTypeTable[BLACK] = HUMAN;
    playerTypeTable[WHITE] = GAME_MODE;
    console.log(playerTypeTable[BLACK], playerTypeTable[WHITE]);
    shiftToNewGameTree(makeGameTree(makeInitialGameBoard(), BLACK, false, 1));
  }

  $("#start-button").click(function () {
    startNewGame();
  });
  resetGame();
  drawGameBoard(makeInitialGameBoard(), "-", []);
})();
