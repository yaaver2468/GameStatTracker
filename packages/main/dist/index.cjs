"use strict";
const electron = require("electron");
const url = require("url");
const path$1 = require("path");
const chokidar = require("chokidar");
const sqlite3 = require("sqlite3");
const fs = require("fs");
const ALLOWED_ORIGINS_AND_PERMISSIONS = /* @__PURE__ */ new Map(
  [[new url.URL("http://localhost:5173/").origin, /* @__PURE__ */ new Set()]]
);
const ALLOWED_EXTERNAL_ORIGINS = /* @__PURE__ */ new Set(["https://github.com"]);
electron.app.on("web-contents-created", (_, contents) => {
  contents.on("will-navigate", (event, url$1) => {
    const { origin } = new url.URL(url$1);
    if (ALLOWED_ORIGINS_AND_PERMISSIONS.has(origin)) {
      return;
    }
    event.preventDefault();
    {
      console.warn(`Blocked navigating to disallowed origin: ${origin}`);
    }
  });
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    var _a;
    const { origin } = new url.URL(webContents.getURL());
    const permissionGranted = !!((_a = ALLOWED_ORIGINS_AND_PERMISSIONS.get(origin)) == null ? void 0 : _a.has(permission));
    callback(permissionGranted);
    if (!permissionGranted && true) {
      console.warn(`${origin} requested permission for '${permission}', but was rejected.`);
    }
  });
  contents.setWindowOpenHandler(({ url: url$1 }) => {
    const { origin } = new url.URL(url$1);
    if (ALLOWED_EXTERNAL_ORIGINS.has(origin)) {
      electron.shell.openExternal(url$1).catch(console.error);
    } else {
      console.warn(`Blocked the opening of a disallowed origin: ${origin}`);
    }
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (event, webPreferences, params) => {
    const { origin } = new url.URL(params.src);
    if (!ALLOWED_ORIGINS_AND_PERMISSIONS.has(origin)) {
      {
        console.warn(`A webview tried to attach ${params.src}, but was blocked.`);
      }
      event.preventDefault();
      return;
    }
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
  });
});
const Store = require("electron-store");
const store = new Store();
const settings = {
  winX: store.get("winX") ?? 0,
  winY: store.get("winY") ?? 0,
  winWidth: store.get("winWidth") ?? 1e3,
  winHeight: store.get("winHeight") ?? 600
};
async function createWindow() {
  function isInFrame() {
    const displays = electron.screen.getAllDisplays();
    return displays.map((dp) => dp.bounds).filter((dp) => dp.x <= settings.winX && dp.x + dp.width >= settings.winX && dp.y <= settings.winY && dp.y + dp.height >= settings.winY)[0] != null;
  }
  const inFrame = isInFrame();
  const browserWindow = new electron.BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: false,
      preload: path$1.join(electron.app.getAppPath(), "packages/preload/dist/index.cjs")
    },
    icon: path$1.join(electron.app.getAppPath(), "packages/main/assets/icon.ico"),
    frame: false,
    minWidth: 1280,
    minHeight: 600,
    x: inFrame ? settings.winX : 0,
    y: inFrame ? settings.winY : 0,
    width: settings.winWidth,
    height: settings.winHeight
  });
  browserWindow.on("ready-to-show", () => {
    browserWindow == null ? void 0 : browserWindow.show();
    {
      browserWindow == null ? void 0 : browserWindow.webContents.openDevTools();
    }
  });
  const pageUrl = "http://localhost:5173/";
  await browserWindow.loadURL(pageUrl);
  browserWindow.on("move", () => {
    const position = browserWindow.getPosition();
    store.set("winX", position[0]);
    store.set("winY", position[1]);
  });
  browserWindow.on("resize", () => {
    const size = browserWindow.getSize();
    store.set("winWidth", size[0]);
    store.set("winHeight", size[1]);
  });
  return browserWindow;
}
async function restoreOrCreateWindow() {
  let window2 = electron.BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (window2 === void 0) {
    window2 = await createWindow();
  }
  if (window2.isMinimized()) {
    window2.restore();
  }
  window2.focus();
  return window2;
}
class GameElimination {
  id;
  gameID;
  time;
  killerID;
  killedID;
  knocked;
  weapon;
  constructor(data = {
    id: 0,
    gameID: "",
    time: 0,
    killerID: "",
    killedID: "",
    knocked: false,
    weapon: ""
  }) {
    this.id = data.id;
    this.gameID = data.gameID;
    this.time = parseInt(data.time.toString());
    this.killerID = data.killerID;
    this.killedID = data.killedID;
    this.knocked = data.knocked;
    this.weapon = data.weapon;
  }
}
class GamePlayer {
  id;
  playerID;
  gameID;
  isBot;
  team;
  kills;
  placement;
  constructor(data = {
    id: 0,
    playerID: "",
    gameID: "",
    isBot: true,
    team: 0,
    kills: 0,
    placement: 999
  }) {
    this.id = data.id;
    this.playerID = data.playerID;
    this.gameID = data.gameID;
    this.isBot = data.isBot;
    this.team = data.team;
    this.kills = data.kills;
    this.placement = data.placement;
  }
}
class GameStat {
  gameID;
  owner;
  timestamp;
  replayName;
  mode;
  bots;
  players;
  duration;
  placement;
  kills;
  assists;
  accuracy;
  damageDealt;
  damageTaken;
  distanceTravelled;
  constructor(data = {
    gameID: "",
    owner: "",
    timestamp: new Date(),
    replayName: "",
    mode: "",
    bots: 0,
    players: 0,
    duration: 0,
    placement: 0,
    kills: 0,
    assists: 0,
    accuracy: 0,
    damageDealt: 0,
    damageTaken: 0,
    distanceTravelled: 0
  }) {
    this.gameID = data.gameID;
    this.owner = data.owner;
    this.timestamp = data.timestamp;
    this.replayName = data.replayName;
    this.mode = data.mode;
    this.bots = data.bots;
    this.players = data.players;
    this.duration = data.duration;
    this.placement = data.placement;
    this.kills = data.kills;
    this.assists = data.assists;
    this.accuracy = data.accuracy;
    this.damageDealt = data.damageDealt;
    this.damageTaken = data.damageTaken;
    this.distanceTravelled = data.distanceTravelled;
  }
}
class Player {
  playerID;
  username;
  isBot;
  platform;
  skin;
  snipes;
  constructor(data = {
    playerID: "",
    username: "AI",
    isBot: true,
    platform: "epic",
    skin: "epic",
    snipes: 0
  }) {
    this.playerID = data.playerID;
    this.username = data.username;
    this.isBot = data.isBot;
    this.platform = data.platform;
    this.skin = data.skin;
    this.snipes = data.snipes;
  }
}
const initStatements = [
  `CREATE TABLE IF NOT EXISTS 'GameEliminations' (
    'id' INTEGER PRIMARY KEY AUTOINCREMENT,
    'gameID' VARCHAR(255) NOT NULL,
    'time' INTEGER NOT NULL,
    'killerID' VARCHAR(255) NOT NULL,
    'killedID' VARCHAR(255) NOT NULL,
    'knocked' TINYINT(1) NOT NULL,
    'weapon' VARCHAR(255) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS 'GamePlayers' (
    'id' INTEGER PRIMARY KEY AUTOINCREMENT,
    'playerID' VARCHAR(255) NOT NULL,
    'gameID' VARCHAR(255) NOT NULL,
    'isBot' TINYINT(1) NOT NULL,
    'team' INTEGER NOT NULL,
    'kills' INTEGER NOT NULL DEFAULT 0,
    'placement' INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS 'GameStats' (
    'gameID' VARCHAR(255) NOT NULL UNIQUE PRIMARY KEY,
    'owner' VARCHAR(255) NOT NULL,
    'timestamp' DATETIME NOT NULL UNIQUE,
    'replayName' VARCHAR(255) NOT NULL,
    'mode' VARCHAR(255) NOT NULL,
    'bots' INTEGER NOT NULL,
    'players' INTEGER NOT NULL,
    'duration' INTEGER DEFAULT -1,
    'placement' INTEGER NOT NULL,
    'kills' INTEGER DEFAULT -1,
    'assists' INTEGER DEFAULT 0,
    'accuracy' DOUBLE PRECISION DEFAULT '-1',
    'damageDealt' INTEGER DEFAULT -1,
    'damageTaken' INTEGER DEFAULT -1,
    'distanceTravelled' DOUBLE PRECISION DEFAULT '-1'
  )`,
  `CREATE TABLE IF NOT EXISTS 'Players' (
    'playerID' VARCHAR(255) NOT NULL UNIQUE PRIMARY KEY,
    'username' VARCHAR(255) NOT NULL,
    'isBot' VARCHAR(255) NOT NULL,
    'platform' VARCHAR(255),
    'skin' VARCHAR(255),
    'snipes' INTEGER NOT NULL DEFAULT 1
  )`
];
async function getAll(sql) {
  return new Promise(function(resolve, reject) {
    db.database.all(sql, function(err, rows) {
      if (err) {
        console.log(err);
        return reject(err);
      }
      resolve(rows);
    });
  });
}
async function serialize(sql) {
  return new Promise((resolve, reject) => {
    db.database.serialize(() => {
      function dbRun(x) {
        if (x < sql.length) {
          db.database.run(sql[x], (err) => {
            if (err) {
              console.log(err);
              return reject(false);
            } else {
              dbRun(++x);
            }
          });
        }
        resolve(true);
      }
      dbRun(0);
    });
  });
}
async function exec(sql) {
  return new Promise(function(resolve, reject) {
    db.database.exec(sql, function(err) {
      if (err) {
        console.log(err);
        return reject(false);
      }
      resolve(true);
    });
  });
}
async function getSingle(sql) {
  return new Promise(function(resolve, reject) {
    db.database.get(sql, function(err, rows) {
      if (err) {
        console.log(err);
        return reject(err);
      }
      resolve(rows);
    });
  });
}
function whereInGenerator(data) {
  return `(${"'" + data.join("','") + "'"})`;
}
class Database {
  database;
  constructor() {
    this.database = new sqlite3.Database("database.db", (err) => {
      if (err)
        console.error("Database opening error: ", err);
    });
    initStatements.forEach((sql) => {
      this.database.run(sql);
    });
  }
  addReplay = async (gamers, kills, players, stat) => {
    function escape(line) {
      return line.replaceAll("'", "''");
    }
    let sql;
    sql = `INSERT INTO GameStats VALUES ('${stat.gameID}', '${stat.owner}', '${stat.timestamp.toISOString()}', '${escape(stat.replayName)}', '${stat.mode}', ${stat.bots}, ${stat.players}, ${stat.duration}, ${stat.placement}, ${stat.kills}, ${stat.assists}, ${stat.accuracy}, ${stat.damageDealt}, ${stat.damageTaken}, ${stat.distanceTravelled})`;
    if (!await exec(sql)) {
      return false;
    }
    sql = `INSERT INTO GamePlayers VALUES ${gamers.map((g) => `(NULL, '${g.playerID}', '${g.gameID}', ${g.isBot ? 1 : 0}, ${g.team}, ${g.kills}, ${g.placement})`).join(", ")}`;
    if (!await exec(sql)) {
      return false;
    }
    if (kills.length > 0) {
      sql = `INSERT INTO GameEliminations VALUES ${kills.map((k) => `(NULL, '${k.gameID}', ${k.time}, '${k.killerID}', '${k.killedID}', ${k.knocked}, '${k.weapon}')`).join(", ")}`;
      if (!await exec(sql)) {
        return false;
      }
    }
    const serializeql = [];
    const playerSql = [];
    for (let x = 0; x < players.length; x++) {
      const p = players[x];
      const existingPlayer = await this.getPlayer(p.playerID);
      const platform = p.platform == null ? "NULL" : `'${p.platform}'`;
      let skin = p.skin == null ? "NULL" : `'${p.skin}'`;
      if (existingPlayer.playerID.length > 0) {
        if (existingPlayer.skin != null && skin == "NULL") {
          skin = existingPlayer.skin;
        }
        serializeql.push(`UPDATE Players SET snipes = snipes + 1, platform = ${platform}, username = '${escape(p.username)}', skin = ${skin} WHERE playerID = '${p.playerID}'`);
      } else {
        playerSql.push(`('${p.playerID}', '${escape(p.username)}', ${p.isBot}, ${platform}, ${skin}, ${p.snipes})`);
      }
    }
    if (playerSql.length > 0) {
      sql = `INSERT INTO Players VALUES ${playerSql.join(", ")}`;
      if (!await exec(sql)) {
        return false;
      }
    }
    return await serialize(serializeql);
  };
  getMatchHistory = async (page = 1) => {
    const limit = 25;
    const result = await getAll(`SELECT * FROM GameStats ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${limit * page - limit}`);
    const matches = [];
    result.forEach((e) => {
      matches.push(new GameStat(e));
    });
    return matches;
  };
  getGamerHistory = async (page = 1, playerID) => {
    const limit = 25;
    const matches = [];
    const gamerGames = await getAll(`SELECT gameID FROM GamePlayers WHERE playerID = '${playerID}'`);
    const result = await getAll(`SELECT * FROM GameStats WHERE gameID IN ${whereInGenerator(gamerGames.map((g) => g.gameID))} ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${limit * page - limit}`);
    result.forEach((e) => {
      matches.push(new GameStat(e));
    });
    return matches;
  };
  getEliminations = async (gameID) => {
    const result = await getAll(`SELECT * FROM GameEliminations WHERE gameID='${gameID}' ORDER BY id`);
    const eliminations = [];
    result.forEach((e) => {
      eliminations.push(new GameElimination(e));
    });
    return eliminations;
  };
  getGamers = async (gameID) => {
    const result = await getAll(`SELECT * FROM GamePlayers WHERE gameID='${gameID}' ORDER BY team`);
    const gamers = [];
    result.forEach((e) => {
      gamers.push(new GamePlayer(e));
    });
    return gamers;
  };
  getGamerPlayers = async (gamers) => {
    const filtered = gamers.map((g) => `${g.playerID}`);
    const result = await getAll(`SELECT * FROM Players WHERE playerID IN ${whereInGenerator(filtered)}`);
    const players = [];
    result.forEach((e) => {
      players.push(new Player(e));
    });
    return players;
  };
  getGameStats = async (gameID) => {
    const result = await getSingle(`SELECT * FROM GameStats WHERE gameID='${gameID}'`);
    return new GameStat(result);
  };
  getPlayer = async (playerID) => {
    const result = await getSingle(`SELECT * FROM Players WHERE playerID='${playerID}'`);
    return new Player(result);
  };
  getPlayerGames = async (playerID) => {
    const result = await getAll(`SELECT * FROM GamePlayers WHERE playerID='${playerID}'`);
    const stats = [];
    result.forEach((e) => {
      stats.push(new GameStat(e));
    });
    return stats;
  };
  getLastGameID = async () => {
    const result = await getSingle("SELECT * FROM GameStats ORDER BY timestamp DESC LIMIT 1");
    return result != null ? result.gameID : null;
  };
  getSnipers = async () => {
    const result = await getAll("SELECT * FROM Players ORDER BY snipes DESC");
    const players = [];
    result.forEach((e) => {
      players.push(new Player(e));
    });
    return players;
  };
  deleteMatch = async (gameID) => {
    await exec(`DELETE FROM GameStats WHERE gameID='${gameID}'`);
    await exec(`UPDATE Players SET snipes = snipes - 1 WHERE playerID IN (SELECT playerID FROM GamePlayers WHERE gameID = '${gameID}')`);
    await exec(`DELETE FROM GamePlayers WHERE gameID='${gameID}'`);
    return await exec(`DELETE FROM GameEliminations WHERE gameID='${gameID}'`);
  };
}
const db = new Database();
const path = [
  "/Script/FortniteGame.FortPlayerStateAthena"
];
const parseLevel = 1;
const exportGroup = "gameData";
const exportName = "players";
const exportType = "array";
const properties = {
  TeamIndex: {
    name: "TeamIndex",
    parseFunction: "readByte",
    parseType: "default"
  },
  Platform: {
    name: "Platform",
    parseFunction: "readString",
    parseType: "default"
  },
  PlayerNamePrivate: {
    name: "PlayerNamePrivate",
    parseFunction: "readString",
    parseType: "default"
  },
  UniqueId: {
    name: "UniqueId",
    parseFunction: "readNetId",
    parseType: "default"
  },
  BotUniqueId: {
    name: "BotUniqueId",
    parseFunction: "readNetId",
    parseType: "default"
  },
  bIsABot: {
    name: "bIsABot",
    parseFunction: "readBit",
    parseType: "default"
  },
  KillScore: {
    name: "KillScore",
    parseFunction: "readInt32",
    parseType: "default"
  },
  Place: {
    name: "Place",
    parseFunction: "readInt32",
    parseType: "default"
  }
};
const FortPlayerState = {
  path,
  parseLevel,
  exportGroup,
  exportName,
  exportType,
  properties
};
const nodeFetch = require("node-fetch");
const parseReplay = require("fortnite-replay-parser");
const client = require("https");
const sharp = require("sharp");
function parsePlayers(players) {
  const result = [];
  players.forEach((p) => {
    if (result.filter((r) => [p.BotUniqueId, p.UniqueId].includes(r.playerID)).length == 0) {
      result.push(new Player({
        playerID: p.BotUniqueId ?? p.UniqueId,
        username: p.PlayerNamePrivate,
        isBot: p.bIsABot != null && p.bIsABot ? true : false,
        platform: p.Platform,
        skin: p.Character != null ? p.Character.name : null,
        snipes: 1
      }));
    }
  });
  return result;
}
function parseEliminations(elims, gameID) {
  const result = [];
  elims.filter((e) => e.group == "playerElim").forEach((e) => {
    result.push(new GameElimination({
      id: 0,
      gameID,
      time: e.startTime,
      killerID: e.eliminator,
      killedID: e.eliminated,
      knocked: e.knocked,
      weapon: e.gunType
    }));
  });
  return result;
}
function parseStats(data, cleanedPlayers, gameID, replayName, mode) {
  const athenaStats = data.events.filter((e) => e.metadata == "AthenaMatchStats").at(-1) ?? {
    startTime: 0,
    eliminations: 0,
    assists: 0,
    accuracy: 0,
    damageToPlayers: 0,
    damageTaken: 0,
    totalTraveled: 0
  };
  const inCreative = mode.toLowerCase().includes("creative");
  const botCount = inCreative ? 0 : cleanedPlayers.filter((p) => p.TeamIndex > 2 && p.bIsABot != null).length;
  const playerCount = cleanedPlayers.filter((p) => p.TeamIndex > 2 && p.bIsABot == null).length;
  const ownerID = cleanedPlayers.filter((p) => p.Owner != null)[0].UniqueId;
  const gameDuration = Math.max(athenaStats.startTime, data.events.at(-1).startTime);
  return new GameStat({
    gameID,
    owner: ownerID,
    timestamp: new Date(data.info.Timestamp),
    replayName,
    mode,
    bots: botCount,
    players: playerCount,
    duration: gameDuration,
    placement: inCreative ? 0 : cleanedPlayers.filter((p) => p.UniqueId == ownerID)[0].Place ?? 0,
    kills: inCreative ? 0 : athenaStats.eliminations,
    assists: inCreative ? 0 : athenaStats.assists,
    accuracy: inCreative ? 0 : athenaStats.accuracy,
    damageDealt: inCreative ? 0 : athenaStats.damageToPlayers,
    damageTaken: inCreative ? 0 : athenaStats.damageTaken,
    distanceTravelled: inCreative ? 0 : athenaStats.totalTraveled
  });
}
function parseGamers(dataPlayers, players, gameID, mode) {
  const gamers = [];
  const inCreative = mode.toLowerCase().includes("creative");
  players.forEach((p) => {
    const dataPlayer = dataPlayers.filter((dp) => dp.UniqueId == p.playerID || dp.BotUniqueId == p.playerID)[0];
    let teamPlacement = inCreative ? 0 : Math.min(...dataPlayers.filter((dp) => dp.TeamIndex == dataPlayer.TeamIndex && dp.Place != null).map((dp) => dp.Place));
    teamPlacement = teamPlacement == Infinity ? 0 : teamPlacement;
    gamers.push(new GamePlayer({
      id: 0,
      playerID: p.playerID,
      gameID,
      isBot: p.isBot,
      team: dataPlayer.TeamIndex != null ? dataPlayer.TeamIndex - 2 : -1,
      kills: dataPlayer.KillScore ?? 0,
      placement: teamPlacement
    }));
  });
  return gamers;
}
async function downloadSkins(players) {
  function downloadImage(url2, filepath) {
    return new Promise((resolve, reject) => {
      client.get(url2, (res) => {
        if (res.statusCode === 200) {
          res.pipe(fs.createWriteStream(filepath)).on("error", reject).once("close", async () => {
            await sharp(filepath).resize(64).toFile(filepath.replace("_rawFile", ""));
            fs.unlink(filepath, (err) => {
              if (err) {
                reject(false);
              }
              resolve(true);
            });
          });
        } else {
          res.resume();
          reject(false);
        }
      });
    });
  }
  const skins = players.filter((p) => p.skin != null).map((p) => p.skin);
  let skinFolder;
  {
    skinFolder = `${__dirname.split("\\").slice(0, -2).join("/")}/renderer/assets/skins/`;
  }
  if (!fs.existsSync(skinFolder)) {
    fs.mkdirSync(skinFolder, { recursive: true });
  }
  for (let x = 0; x < skins.length; x++) {
    const skinPath = skinFolder + skins[x] + ".png";
    const exists = fs.existsSync(`${skinPath}`);
    if (!exists) {
      const url2 = `https://fortnite-api.com/v2/cosmetics/br/${skins[x]}`;
      const res = await nodeFetch(url2);
      const jbody = await res.json();
      if (jbody.data != null && await downloadImage(jbody.data.images.smallIcon, `${skinFolder + skins[x] + "_rawFile.png"}`) == false) {
        console.log("Failed to download skin.");
      }
    }
  }
}
async function addReplay(path2) {
  const replayName = path2.split("\\").pop() ?? "Invalid Replay Name";
  const data = await parseReplay(fs.readFileSync(path2), {
    customNetFieldExports: [FortPlayerState],
    parseLevel: 1,
    debug: false
  }).catch((_) => {
    return null;
  });
  if (data == null) {
    return false;
  }
  const gameID = data.gameData.gameState.GameSessionId;
  if ((await db.getGameStats(gameID)).gameID.length > 0) {
    return true;
  }
  const mode = data.gameData.playlistInfo;
  const cleanedPlayers = data.gameData.players.filter((p) => p.BotUniqueId != null || p.UniqueId != null);
  const players = parsePlayers(cleanedPlayers);
  const kills = parseEliminations(data.events, gameID);
  const stat = parseStats(data, cleanedPlayers, gameID, replayName, mode);
  const gamers = parseGamers(cleanedPlayers, players, gameID, mode);
  await downloadSkins(players);
  return await db.addReplay(gamers, kills, players, stat);
}
let window;
const isSingleInstance = electron.app.requestSingleInstanceLock();
if (!isSingleInstance) {
  electron.app.quit();
  process.exit(0);
}
electron.app.on("second-instance", restoreOrCreateWindow);
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("activate", restoreOrCreateWindow);
electron.app.whenReady().then(async () => {
  window = await restoreOrCreateWindow();
}).catch((e) => console.error("Failed create window:", e));
function resolveToAbsolutePath(path2) {
  return path2.replace(/%([^%]+)%/g, function(_, key) {
    return process.env[key];
  });
}
const replayFolder = resolveToAbsolutePath("%LOCALAPPDATA%\\FortniteGame\\Saved\\Demos");
chokidar.watch(replayFolder, {
  awaitWriteFinish: {
    stabilityThreshold: 1e3
  }
}).on("change", async (path2) => {
  const result = await addReplay(path2);
  if (result) {
    window.reload();
  }
});
electron.ipcMain.handle("addReplay", async (_) => {
  const res = await electron.dialog.showOpenDialog({ properties: ["openFile", "multiSelections"], defaultPath: replayFolder });
  if (!res.canceled && res.filePaths.length > 0) {
    for (let x = 0; x < res.filePaths.length; x++) {
      const path2 = res.filePaths[x];
      const result = await addReplay(path2);
      if (res.filePaths.length == 1 && result) {
        return "last";
      }
    }
  }
  return null;
});
electron.ipcMain.on("closeProgram", () => {
  electron.app.exit();
});
electron.ipcMain.on("minimizeProgram", () => {
  window.minimize();
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguY2pzIiwic291cmNlcyI6WyIuLi9zcmMvc2VjdXJpdHktcmVzdHJpY3Rpb25zLnRzIiwiLi4vc3JjL21haW5XaW5kb3cudHMiLCIuLi8uLi9wcmVsb2FkL3NyYy9tb2RlbHMvR2FtZUVsaW1pbmF0aW9uLnRzIiwiLi4vLi4vcHJlbG9hZC9zcmMvbW9kZWxzL0dhbWVQbGF5ZXIudHMiLCIuLi8uLi9wcmVsb2FkL3NyYy9tb2RlbHMvR2FtZVN0YXQudHMiLCIuLi8uLi9wcmVsb2FkL3NyYy9tb2RlbHMvUGxheWVyLnRzIiwiLi4vLi4vcHJlbG9hZC9zcmMvZGF0YWJhc2UudHMiLCIuLi9zcmMvcmVwbGF5UGFyc2VyLnRzIiwiLi4vc3JjL2luZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7YXBwLCBzaGVsbH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHtVUkx9IGZyb20gJ3VybCc7XG5cbnR5cGUgUGVybWlzc2lvbnMgPVxuICB8ICdjbGlwYm9hcmQtcmVhZCdcbiAgfCAnbWVkaWEnXG4gIHwgJ2Rpc3BsYXktY2FwdHVyZSdcbiAgfCAnbWVkaWFLZXlTeXN0ZW0nXG4gIHwgJ2dlb2xvY2F0aW9uJ1xuICB8ICdub3RpZmljYXRpb25zJ1xuICB8ICdtaWRpJ1xuICB8ICdtaWRpU3lzZXgnXG4gIHwgJ3BvaW50ZXJMb2NrJ1xuICB8ICdmdWxsc2NyZWVuJ1xuICB8ICdvcGVuRXh0ZXJuYWwnXG4gIHwgJ3Vua25vd24nO1xuXG4vKipcbiAqIEEgbGlzdCBvZiBvcmlnaW5zIHRoYXQgeW91IGFsbG93IG9wZW4gSU5TSURFIHRoZSBhcHBsaWNhdGlvbiBhbmQgcGVybWlzc2lvbnMgZm9yIHRoZW0uXG4gKlxuICogSW4gZGV2ZWxvcG1lbnQgbW9kZSB5b3UgbmVlZCBhbGxvdyBvcGVuIGBWSVRFX0RFVl9TRVJWRVJfVVJMYC5cbiAqL1xuY29uc3QgQUxMT1dFRF9PUklHSU5TX0FORF9QRVJNSVNTSU9OUyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8UGVybWlzc2lvbnM+PihcbiAgaW1wb3J0Lm1ldGEuZW52LkRFViAmJiBpbXBvcnQubWV0YS5lbnYuVklURV9ERVZfU0VSVkVSX1VSTFxuICAgID8gW1tuZXcgVVJMKGltcG9ydC5tZXRhLmVudi5WSVRFX0RFVl9TRVJWRVJfVVJMKS5vcmlnaW4sIG5ldyBTZXQoKV1dXG4gICAgOiBbXSxcbik7XG5cbi8qKlxuICogQSBsaXN0IG9mIG9yaWdpbnMgdGhhdCB5b3UgYWxsb3cgb3BlbiBJTiBCUk9XU0VSLlxuICogTmF2aWdhdGlvbiB0byB0aGUgb3JpZ2lucyBiZWxvdyBpcyBvbmx5IHBvc3NpYmxlIGlmIHRoZSBsaW5rIG9wZW5zIGluIGEgbmV3IHdpbmRvdy5cbiAqXG4gKiBAZXhhbXBsZVxuICogPGFcbiAqICAgdGFyZ2V0PVwiX2JsYW5rXCJcbiAqICAgaHJlZj1cImh0dHBzOi8vZ2l0aHViLmNvbS9cIlxuICogPlxuICovXG5jb25zdCBBTExPV0VEX0VYVEVSTkFMX09SSUdJTlMgPSBuZXcgU2V0PGBodHRwczovLyR7c3RyaW5nfWA+KFsnaHR0cHM6Ly9naXRodWIuY29tJ10pO1xuXG5hcHAub24oJ3dlYi1jb250ZW50cy1jcmVhdGVkJywgKF8sIGNvbnRlbnRzKSA9PiB7XG4gIC8qKlxuICAgKiBCbG9jayBuYXZpZ2F0aW9uIHRvIG9yaWdpbnMgbm90IG9uIHRoZSBhbGxvd2xpc3QuXG4gICAqXG4gICAqIE5hdmlnYXRpb24gZXhwbG9pdHMgYXJlIHF1aXRlIGNvbW1vbi4gSWYgYW4gYXR0YWNrZXIgY2FuIGNvbnZpbmNlIHRoZSBhcHAgdG8gbmF2aWdhdGUgYXdheSBmcm9tIGl0cyBjdXJyZW50IHBhZ2UsXG4gICAqIHRoZXkgY2FuIHBvc3NpYmx5IGZvcmNlIHRoZSBhcHAgdG8gb3BlbiBhcmJpdHJhcnkgd2ViIHJlc291cmNlcy93ZWJzaXRlcyBvbiB0aGUgd2ViLlxuICAgKlxuICAgKiBAc2VlIGh0dHBzOi8vd3d3LmVsZWN0cm9uanMub3JnL2RvY3MvbGF0ZXN0L3R1dG9yaWFsL3NlY3VyaXR5IzEzLWRpc2FibGUtb3ItbGltaXQtbmF2aWdhdGlvblxuICAgKi9cbiAgY29udGVudHMub24oJ3dpbGwtbmF2aWdhdGUnLCAoZXZlbnQsIHVybCkgPT4ge1xuICAgIGNvbnN0IHtvcmlnaW59ID0gbmV3IFVSTCh1cmwpO1xuICAgIGlmIChBTExPV0VEX09SSUdJTlNfQU5EX1BFUk1JU1NJT05TLmhhcyhvcmlnaW4pKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUHJldmVudCBuYXZpZ2F0aW9uXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuICAgIGlmIChpbXBvcnQubWV0YS5lbnYuREVWKSB7XG4gICAgICBjb25zb2xlLndhcm4oYEJsb2NrZWQgbmF2aWdhdGluZyB0byBkaXNhbGxvd2VkIG9yaWdpbjogJHtvcmlnaW59YCk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogQmxvY2sgcmVxdWVzdHMgZm9yIGRpc2FsbG93ZWQgcGVybWlzc2lvbnMuXG4gICAqIEJ5IGRlZmF1bHQsIEVsZWN0cm9uIHdpbGwgYXV0b21hdGljYWxseSBhcHByb3ZlIGFsbCBwZXJtaXNzaW9uIHJlcXVlc3RzLlxuICAgKlxuICAgKiBAc2VlIGh0dHBzOi8vd3d3LmVsZWN0cm9uanMub3JnL2RvY3MvbGF0ZXN0L3R1dG9yaWFsL3NlY3VyaXR5IzUtaGFuZGxlLXNlc3Npb24tcGVybWlzc2lvbi1yZXF1ZXN0cy1mcm9tLXJlbW90ZS1jb250ZW50XG4gICAqL1xuICBjb250ZW50cy5zZXNzaW9uLnNldFBlcm1pc3Npb25SZXF1ZXN0SGFuZGxlcigod2ViQ29udGVudHMsIHBlcm1pc3Npb24sIGNhbGxiYWNrKSA9PiB7XG4gICAgY29uc3Qge29yaWdpbn0gPSBuZXcgVVJMKHdlYkNvbnRlbnRzLmdldFVSTCgpKTtcblxuICAgIGNvbnN0IHBlcm1pc3Npb25HcmFudGVkID0gISFBTExPV0VEX09SSUdJTlNfQU5EX1BFUk1JU1NJT05TLmdldChvcmlnaW4pPy5oYXMocGVybWlzc2lvbik7XG4gICAgY2FsbGJhY2socGVybWlzc2lvbkdyYW50ZWQpO1xuXG4gICAgaWYgKCFwZXJtaXNzaW9uR3JhbnRlZCAmJiBpbXBvcnQubWV0YS5lbnYuREVWKSB7XG4gICAgICBjb25zb2xlLndhcm4oYCR7b3JpZ2lufSByZXF1ZXN0ZWQgcGVybWlzc2lvbiBmb3IgJyR7cGVybWlzc2lvbn0nLCBidXQgd2FzIHJlamVjdGVkLmApO1xuICAgIH1cbiAgfSk7XG5cbiAgLyoqXG4gICAqIEh5cGVybGlua3MgbGVhZGluZyB0byBhbGxvd2VkIHNpdGVzIGFyZSBvcGVuZWQgaW4gdGhlIGRlZmF1bHQgYnJvd3Nlci5cbiAgICpcbiAgICogVGhlIGNyZWF0aW9uIG9mIG5ldyBgd2ViQ29udGVudHNgIGlzIGEgY29tbW9uIGF0dGFjayB2ZWN0b3IuIEF0dGFja2VycyBhdHRlbXB0IHRvIGNvbnZpbmNlIHRoZSBhcHAgdG8gY3JlYXRlIG5ldyB3aW5kb3dzLFxuICAgKiBmcmFtZXMsIG9yIG90aGVyIHJlbmRlcmVyIHByb2Nlc3NlcyB3aXRoIG1vcmUgcHJpdmlsZWdlcyB0aGFuIHRoZXkgaGFkIGJlZm9yZTsgb3Igd2l0aCBwYWdlcyBvcGVuZWQgdGhhdCB0aGV5IGNvdWxkbid0IG9wZW4gYmVmb3JlLlxuICAgKiBZb3Ugc2hvdWxkIGRlbnkgYW55IHVuZXhwZWN0ZWQgd2luZG93IGNyZWF0aW9uLlxuICAgKlxuICAgKiBAc2VlIGh0dHBzOi8vd3d3LmVsZWN0cm9uanMub3JnL2RvY3MvbGF0ZXN0L3R1dG9yaWFsL3NlY3VyaXR5IzE0LWRpc2FibGUtb3ItbGltaXQtY3JlYXRpb24tb2YtbmV3LXdpbmRvd3NcbiAgICogQHNlZSBodHRwczovL3d3dy5lbGVjdHJvbmpzLm9yZy9kb2NzL2xhdGVzdC90dXRvcmlhbC9zZWN1cml0eSMxNS1kby1ub3QtdXNlLW9wZW5leHRlcm5hbC13aXRoLXVudHJ1c3RlZC1jb250ZW50XG4gICAqL1xuICBjb250ZW50cy5zZXRXaW5kb3dPcGVuSGFuZGxlcigoe3VybH0pID0+IHtcbiAgICBjb25zdCB7b3JpZ2lufSA9IG5ldyBVUkwodXJsKTtcblxuICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgVHlwZSBjaGVja2luZyBpcyBwZXJmb3JtZWQgaW4gcnVudGltZS5cbiAgICBpZiAoQUxMT1dFRF9FWFRFUk5BTF9PUklHSU5TLmhhcyhvcmlnaW4pKSB7XG4gICAgICAvLyBPcGVuIHVybCBpbiBkZWZhdWx0IGJyb3dzZXIuXG4gICAgICBzaGVsbC5vcGVuRXh0ZXJuYWwodXJsKS5jYXRjaChjb25zb2xlLmVycm9yKTtcbiAgICB9IGVsc2UgaWYgKGltcG9ydC5tZXRhLmVudi5ERVYpIHtcbiAgICAgIGNvbnNvbGUud2FybihgQmxvY2tlZCB0aGUgb3BlbmluZyBvZiBhIGRpc2FsbG93ZWQgb3JpZ2luOiAke29yaWdpbn1gKTtcbiAgICB9XG5cbiAgICAvLyBQcmV2ZW50IGNyZWF0aW5nIGEgbmV3IHdpbmRvdy5cbiAgICByZXR1cm4ge2FjdGlvbjogJ2RlbnknfTtcbiAgfSk7XG5cbiAgLyoqXG4gICAqIFZlcmlmeSB3ZWJ2aWV3IG9wdGlvbnMgYmVmb3JlIGNyZWF0aW9uLlxuICAgKlxuICAgKiBTdHJpcCBhd2F5IHByZWxvYWQgc2NyaXB0cywgZGlzYWJsZSBOb2RlLmpzIGludGVncmF0aW9uLCBhbmQgZW5zdXJlIG9yaWdpbnMgYXJlIG9uIHRoZSBhbGxvd2xpc3QuXG4gICAqXG4gICAqIEBzZWUgaHR0cHM6Ly93d3cuZWxlY3Ryb25qcy5vcmcvZG9jcy9sYXRlc3QvdHV0b3JpYWwvc2VjdXJpdHkjMTItdmVyaWZ5LXdlYnZpZXctb3B0aW9ucy1iZWZvcmUtY3JlYXRpb25cbiAgICovXG4gIGNvbnRlbnRzLm9uKCd3aWxsLWF0dGFjaC13ZWJ2aWV3JywgKGV2ZW50LCB3ZWJQcmVmZXJlbmNlcywgcGFyYW1zKSA9PiB7XG4gICAgY29uc3Qge29yaWdpbn0gPSBuZXcgVVJMKHBhcmFtcy5zcmMpO1xuICAgIGlmICghQUxMT1dFRF9PUklHSU5TX0FORF9QRVJNSVNTSU9OUy5oYXMob3JpZ2luKSkge1xuICAgICAgaWYgKGltcG9ydC5tZXRhLmVudi5ERVYpIHtcbiAgICAgICAgY29uc29sZS53YXJuKGBBIHdlYnZpZXcgdHJpZWQgdG8gYXR0YWNoICR7cGFyYW1zLnNyY30sIGJ1dCB3YXMgYmxvY2tlZC5gKTtcbiAgICAgIH1cblxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBTdHJpcCBhd2F5IHByZWxvYWQgc2NyaXB0cyBpZiB1bnVzZWQgb3IgdmVyaWZ5IHRoZWlyIGxvY2F0aW9uIGlzIGxlZ2l0aW1hdGUuXG4gICAgZGVsZXRlIHdlYlByZWZlcmVuY2VzLnByZWxvYWQ7XG4gICAgLy8gQHRzLWV4cGVjdC1lcnJvciBgcHJlbG9hZFVSTGAgZXhpc3RzLiAtIEBzZWUgaHR0cHM6Ly93d3cuZWxlY3Ryb25qcy5vcmcvZG9jcy9sYXRlc3QvYXBpL3dlYi1jb250ZW50cyNldmVudC13aWxsLWF0dGFjaC13ZWJ2aWV3XG4gICAgZGVsZXRlIHdlYlByZWZlcmVuY2VzLnByZWxvYWRVUkw7XG5cbiAgICAvLyBEaXNhYmxlIE5vZGUuanMgaW50ZWdyYXRpb25cbiAgICB3ZWJQcmVmZXJlbmNlcy5ub2RlSW50ZWdyYXRpb24gPSBmYWxzZTtcblxuICAgIC8vIEVuYWJsZSBjb250ZXh0SXNvbGF0aW9uXG4gICAgd2ViUHJlZmVyZW5jZXMuY29udGV4dElzb2xhdGlvbiA9IHRydWU7XG4gIH0pO1xufSk7XG4iLCJpbXBvcnQge2FwcCwgQnJvd3NlcldpbmRvdywgc2NyZWVufSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQge2pvaW59IGZyb20gJ3BhdGgnO1xuaW1wb3J0IHtVUkx9IGZyb20gJ3VybCc7XG5jb25zdCBTdG9yZSA9IHJlcXVpcmUoJ2VsZWN0cm9uLXN0b3JlJyk7XG5cbmNvbnN0IHN0b3JlID0gbmV3IFN0b3JlKCk7XG5jb25zdCBzZXR0aW5ncyA9IHtcbiAgd2luWDogc3RvcmUuZ2V0KCd3aW5YJykgPz8gMCxcbiAgd2luWTogc3RvcmUuZ2V0KCd3aW5ZJykgPz8gMCxcbiAgd2luV2lkdGg6IHN0b3JlLmdldCgnd2luV2lkdGgnKSA/PyAxMDAwLFxuICB3aW5IZWlnaHQ6IHN0b3JlLmdldCgnd2luSGVpZ2h0JykgPz8gNjAwLFxufTtcblxuXG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVdpbmRvdygpIHtcbiAgZnVuY3Rpb24gaXNJbkZyYW1lKCkge1xuICAgIGNvbnN0IGRpc3BsYXlzID0gc2NyZWVuLmdldEFsbERpc3BsYXlzKCk7XG4gICAgcmV0dXJuIGRpc3BsYXlzXG4gICAgICAubWFwKGRwID0+IGRwLmJvdW5kcylcbiAgICAgIC5maWx0ZXIoZHAgPT4gZHAueCA8PSBzZXR0aW5ncy53aW5YICYmXG4gICAgICAgIChkcC54ICsgZHAud2lkdGgpID49IHNldHRpbmdzLndpblggJiZcbiAgICAgICAgZHAueSA8PSBzZXR0aW5ncy53aW5ZICYmXG4gICAgICAgIChkcC55ICsgZHAuaGVpZ2h0KSA+PSBzZXR0aW5ncy53aW5ZKVswXSAhPSBudWxsO1xuICB9XG4gIGNvbnN0IGluRnJhbWUgPSBpc0luRnJhbWUoKTtcbiAgY29uc3QgYnJvd3NlcldpbmRvdyA9IG5ldyBCcm93c2VyV2luZG93KHtcbiAgICBzaG93OiBmYWxzZSwgLy8gVXNlIHRoZSAncmVhZHktdG8tc2hvdycgZXZlbnQgdG8gc2hvdyB0aGUgaW5zdGFudGlhdGVkIEJyb3dzZXJXaW5kb3cuXG4gICAgd2ViUHJlZmVyZW5jZXM6IHtcbiAgICAgIG5vZGVJbnRlZ3JhdGlvbjogZmFsc2UsXG4gICAgICBjb250ZXh0SXNvbGF0aW9uOiB0cnVlLFxuICAgICAgc2FuZGJveDogZmFsc2UsIC8vIFNhbmRib3ggZGlzYWJsZWQgYmVjYXVzZSB0aGUgZGVtbyBvZiBwcmVsb2FkIHNjcmlwdCBkZXBlbmQgb24gdGhlIE5vZGUuanMgYXBpXG4gICAgICB3ZWJ2aWV3VGFnOiBmYWxzZSwgLy8gVGhlIHdlYnZpZXcgdGFnIGlzIG5vdCByZWNvbW1lbmRlZC4gQ29uc2lkZXIgYWx0ZXJuYXRpdmVzIGxpa2UgYW4gaWZyYW1lIG9yIEVsZWN0cm9uJ3MgQnJvd3NlclZpZXcuIEBzZWUgaHR0cHM6Ly93d3cuZWxlY3Ryb25qcy5vcmcvZG9jcy9sYXRlc3QvYXBpL3dlYnZpZXctdGFnI3dhcm5pbmdcbiAgICAgIHByZWxvYWQ6IGpvaW4oYXBwLmdldEFwcFBhdGgoKSwgJ3BhY2thZ2VzL3ByZWxvYWQvZGlzdC9pbmRleC5janMnKSxcbiAgICB9LFxuICAgIGljb246IGpvaW4oYXBwLmdldEFwcFBhdGgoKSwgJ3BhY2thZ2VzL21haW4vYXNzZXRzL2ljb24uaWNvJyksXG4gICAgZnJhbWU6IGZhbHNlLFxuICAgIG1pbldpZHRoOiAxMjgwLFxuICAgIG1pbkhlaWdodDogNjAwLFxuICAgIHg6IGluRnJhbWUgPyBzZXR0aW5ncy53aW5YIDogMCxcbiAgICB5OiBpbkZyYW1lID8gc2V0dGluZ3Mud2luWSA6IDAsXG4gICAgd2lkdGg6IHNldHRpbmdzLndpbldpZHRoLFxuICAgIGhlaWdodDogc2V0dGluZ3Mud2luSGVpZ2h0LFxuICB9KTtcblxuICAvKipcbiAgICogSWYgdGhlICdzaG93JyBwcm9wZXJ0eSBvZiB0aGUgQnJvd3NlcldpbmRvdydzIGNvbnN0cnVjdG9yIGlzIG9taXR0ZWQgZnJvbSB0aGUgaW5pdGlhbGl6YXRpb24gb3B0aW9ucyxcbiAgICogaXQgdGhlbiBkZWZhdWx0cyB0byAndHJ1ZScuIFRoaXMgY2FuIGNhdXNlIGZsaWNrZXJpbmcgYXMgdGhlIHdpbmRvdyBsb2FkcyB0aGUgaHRtbCBjb250ZW50LFxuICAgKiBhbmQgaXQgYWxzbyBoYXMgc2hvdyBwcm9ibGVtYXRpYyBiZWhhdmlvdXIgd2l0aCB0aGUgY2xvc2luZyBvZiB0aGUgd2luZG93LlxuICAgKiBVc2UgYHNob3c6IGZhbHNlYCBhbmQgbGlzdGVuIHRvIHRoZSAgYHJlYWR5LXRvLXNob3dgIGV2ZW50IHRvIHNob3cgdGhlIHdpbmRvdy5cbiAgICpcbiAgICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vZWxlY3Ryb24vZWxlY3Ryb24vaXNzdWVzLzI1MDEyIGZvciB0aGUgYWZmb3JkIG1lbnRpb25lZCBpc3N1ZS5cbiAgICovXG4gIGJyb3dzZXJXaW5kb3cub24oJ3JlYWR5LXRvLXNob3cnLCAoKSA9PiB7XG4gICAgYnJvd3NlcldpbmRvdz8uc2hvdygpO1xuXG4gICAgaWYgKGltcG9ydC5tZXRhLmVudi5ERVYpIHtcbiAgICAgIGJyb3dzZXJXaW5kb3c/LndlYkNvbnRlbnRzLm9wZW5EZXZUb29scygpO1xuICAgIH1cbiAgfSk7XG5cbiAgLyoqXG4gICAqIFVSTCBmb3IgbWFpbiB3aW5kb3cuXG4gICAqIFZpdGUgZGV2IHNlcnZlciBmb3IgZGV2ZWxvcG1lbnQuXG4gICAqIGBmaWxlOi8vLi4vcmVuZGVyZXIvaW5kZXguaHRtbGAgZm9yIHByb2R1Y3Rpb24gYW5kIHRlc3QuXG4gICAqL1xuICBjb25zdCBwYWdlVXJsID1cbiAgICBpbXBvcnQubWV0YS5lbnYuREVWICYmIGltcG9ydC5tZXRhLmVudi5WSVRFX0RFVl9TRVJWRVJfVVJMICE9PSB1bmRlZmluZWRcbiAgICAgID8gaW1wb3J0Lm1ldGEuZW52LlZJVEVfREVWX1NFUlZFUl9VUkxcbiAgICAgIDogbmV3IFVSTCgnLi4vcmVuZGVyZXIvZGlzdC9pbmRleC5odG1sJywgJ2ZpbGU6Ly8nICsgX19kaXJuYW1lKS50b1N0cmluZygpO1xuXG4gIGF3YWl0IGJyb3dzZXJXaW5kb3cubG9hZFVSTChwYWdlVXJsKTtcblxuICBicm93c2VyV2luZG93Lm9uKCdtb3ZlJywgKCkgPT4ge1xuICAgIGNvbnN0IHBvc2l0aW9uID0gYnJvd3NlcldpbmRvdy5nZXRQb3NpdGlvbigpO1xuICAgIHN0b3JlLnNldCgnd2luWCcsIHBvc2l0aW9uWzBdKTtcbiAgICBzdG9yZS5zZXQoJ3dpblknLCBwb3NpdGlvblsxXSk7XG4gIH0pO1xuXG4gIGJyb3dzZXJXaW5kb3cub24oJ3Jlc2l6ZScsICgpID0+IHtcbiAgICBjb25zdCBzaXplID0gYnJvd3NlcldpbmRvdy5nZXRTaXplKCk7XG4gICAgc3RvcmUuc2V0KCd3aW5XaWR0aCcsIHNpemVbMF0pO1xuICAgIHN0b3JlLnNldCgnd2luSGVpZ2h0Jywgc2l6ZVsxXSk7XG4gIH0pO1xuXG4gIHJldHVybiBicm93c2VyV2luZG93O1xufVxuXG4vKipcbiAqIFJlc3RvcmUgYW4gZXhpc3RpbmcgQnJvd3NlcldpbmRvdyBvciBDcmVhdGUgYSBuZXcgQnJvd3NlcldpbmRvdy5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlc3RvcmVPckNyZWF0ZVdpbmRvdygpIHtcbiAgbGV0IHdpbmRvdyA9IEJyb3dzZXJXaW5kb3cuZ2V0QWxsV2luZG93cygpLmZpbmQodyA9PiAhdy5pc0Rlc3Ryb3llZCgpKTtcblxuICBpZiAod2luZG93ID09PSB1bmRlZmluZWQpIHtcbiAgICB3aW5kb3cgPSBhd2FpdCBjcmVhdGVXaW5kb3coKTtcbiAgfVxuXG4gIGlmICh3aW5kb3cuaXNNaW5pbWl6ZWQoKSkge1xuICAgIHdpbmRvdy5yZXN0b3JlKCk7XG4gIH1cblxuICB3aW5kb3cuZm9jdXMoKTtcbiAgcmV0dXJuIHdpbmRvdztcbn1cbiIsImNsYXNzIEdhbWVFbGltaW5hdGlvbiB7XG4gIGlkOiBudW1iZXI7XG4gIGdhbWVJRDogc3RyaW5nO1xuICB0aW1lOiBudW1iZXI7XG4gIGtpbGxlcklEOiBzdHJpbmc7XG4gIGtpbGxlZElEOiBzdHJpbmc7XG4gIGtub2NrZWQ6IGJvb2xlYW47XG4gIHdlYXBvbjogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKGRhdGEgPSB7XG4gICAgaWQ6IDAsXG4gICAgZ2FtZUlEOiAnJyxcbiAgICB0aW1lOiAwLFxuICAgIGtpbGxlcklEOiAnJyxcbiAgICBraWxsZWRJRDogJycsXG4gICAga25vY2tlZDogZmFsc2UsXG4gICAgd2VhcG9uOiAnJyxcbiAgfSkge1xuICAgIHRoaXMuaWQgPSBkYXRhLmlkO1xuICAgIHRoaXMuZ2FtZUlEID0gZGF0YS5nYW1lSUQ7XG4gICAgdGhpcy50aW1lID0gcGFyc2VJbnQoZGF0YS50aW1lLnRvU3RyaW5nKCkpO1xuICAgIHRoaXMua2lsbGVySUQgPSBkYXRhLmtpbGxlcklEO1xuICAgIHRoaXMua2lsbGVkSUQgPSBkYXRhLmtpbGxlZElEO1xuICAgIHRoaXMua25vY2tlZCA9IGRhdGEua25vY2tlZDtcbiAgICB0aGlzLndlYXBvbiA9IGRhdGEud2VhcG9uO1xuICB9XG59XG5cbmV4cG9ydCB7IEdhbWVFbGltaW5hdGlvbiB9O1xuIiwiY2xhc3MgR2FtZVBsYXllciB7XG4gIGlkOiBudW1iZXI7XG4gIHBsYXllcklEOiBzdHJpbmc7XG4gIGdhbWVJRDogc3RyaW5nO1xuICBpc0JvdDogYm9vbGVhbjtcbiAgdGVhbTogbnVtYmVyO1xuICBraWxsczogbnVtYmVyO1xuICBwbGFjZW1lbnQ6IG51bWJlcjtcblxuICBjb25zdHJ1Y3RvcihkYXRhID0ge1xuICAgIGlkOiAwLFxuICAgIHBsYXllcklEOiAnJyxcbiAgICBnYW1lSUQ6ICcnLFxuICAgIGlzQm90OiB0cnVlLFxuICAgIHRlYW06IDAsXG4gICAga2lsbHM6IDAsXG4gICAgcGxhY2VtZW50OiA5OTksXG4gIH0pIHtcbiAgICB0aGlzLmlkID0gZGF0YS5pZDtcbiAgICB0aGlzLnBsYXllcklEID0gZGF0YS5wbGF5ZXJJRDtcbiAgICB0aGlzLmdhbWVJRCA9IGRhdGEuZ2FtZUlEO1xuICAgIHRoaXMuaXNCb3QgPSBkYXRhLmlzQm90O1xuICAgIHRoaXMudGVhbSA9IGRhdGEudGVhbTtcbiAgICB0aGlzLmtpbGxzID0gZGF0YS5raWxscztcbiAgICB0aGlzLnBsYWNlbWVudCA9IGRhdGEucGxhY2VtZW50O1xuICB9XG59XG5cbmV4cG9ydCB7IEdhbWVQbGF5ZXIgfTtcbiIsImNsYXNzIEdhbWVTdGF0IHtcbiAgZ2FtZUlEOiBzdHJpbmc7XG4gIG93bmVyOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogRGF0ZTtcbiAgcmVwbGF5TmFtZTogc3RyaW5nO1xuICBtb2RlOiBzdHJpbmc7XG4gIGJvdHM6IG51bWJlcjtcbiAgcGxheWVyczogbnVtYmVyO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBwbGFjZW1lbnQ6IG51bWJlcjtcbiAga2lsbHM6IG51bWJlcjtcbiAgYXNzaXN0czogbnVtYmVyO1xuICBhY2N1cmFjeTogbnVtYmVyO1xuICBkYW1hZ2VEZWFsdDogbnVtYmVyO1xuICBkYW1hZ2VUYWtlbjogbnVtYmVyO1xuICBkaXN0YW5jZVRyYXZlbGxlZDogbnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKGRhdGEgPSB7XG4gICAgZ2FtZUlEOiAnJyxcbiAgICBvd25lcjogJycsXG4gICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLFxuICAgIHJlcGxheU5hbWU6ICcnLFxuICAgIG1vZGU6ICcnLFxuICAgIGJvdHM6IDAsXG4gICAgcGxheWVyczogMCxcbiAgICBkdXJhdGlvbjogMCxcbiAgICBwbGFjZW1lbnQ6IDAsXG4gICAga2lsbHM6IDAsXG4gICAgYXNzaXN0czogMCxcbiAgICBhY2N1cmFjeTogMCxcbiAgICBkYW1hZ2VEZWFsdDogMCxcbiAgICBkYW1hZ2VUYWtlbjogMCxcbiAgICBkaXN0YW5jZVRyYXZlbGxlZDogMCxcbiAgfSkge1xuICAgIHRoaXMuZ2FtZUlEID0gZGF0YS5nYW1lSUQ7XG4gICAgdGhpcy5vd25lciA9IGRhdGEub3duZXI7XG4gICAgdGhpcy50aW1lc3RhbXAgPSBkYXRhLnRpbWVzdGFtcDtcbiAgICB0aGlzLnJlcGxheU5hbWUgPSBkYXRhLnJlcGxheU5hbWU7XG4gICAgdGhpcy5tb2RlID0gZGF0YS5tb2RlO1xuICAgIHRoaXMuYm90cyA9IGRhdGEuYm90cztcbiAgICB0aGlzLnBsYXllcnMgPSBkYXRhLnBsYXllcnM7XG4gICAgdGhpcy5kdXJhdGlvbiA9IGRhdGEuZHVyYXRpb247XG4gICAgdGhpcy5wbGFjZW1lbnQgPSBkYXRhLnBsYWNlbWVudDtcbiAgICB0aGlzLmtpbGxzID0gZGF0YS5raWxscztcbiAgICB0aGlzLmFzc2lzdHMgPSBkYXRhLmFzc2lzdHM7XG4gICAgdGhpcy5hY2N1cmFjeSA9IGRhdGEuYWNjdXJhY3k7XG4gICAgdGhpcy5kYW1hZ2VEZWFsdCA9IGRhdGEuZGFtYWdlRGVhbHQ7XG4gICAgdGhpcy5kYW1hZ2VUYWtlbiA9IGRhdGEuZGFtYWdlVGFrZW47XG4gICAgdGhpcy5kaXN0YW5jZVRyYXZlbGxlZCA9IGRhdGEuZGlzdGFuY2VUcmF2ZWxsZWQ7XG4gIH1cbn1cblxuZXhwb3J0IHsgR2FtZVN0YXQgfTtcbiIsImNsYXNzIFBsYXllciB7XG4gIHBsYXllcklEOiBzdHJpbmc7XG4gIHVzZXJuYW1lOiBzdHJpbmc7XG4gIGlzQm90OiBib29sZWFuO1xuICBwbGF0Zm9ybTogc3RyaW5nO1xuICBza2luOiBzdHJpbmc7XG4gIHNuaXBlczogbnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKGRhdGEgPSB7XG4gICAgcGxheWVySUQ6ICcnLFxuICAgIHVzZXJuYW1lOiAnQUknLFxuICAgIGlzQm90OiB0cnVlLFxuICAgIHBsYXRmb3JtOiAnZXBpYycsXG4gICAgc2tpbjogJ2VwaWMnLFxuICAgIHNuaXBlczogMCxcbiAgfSkge1xuICAgIHRoaXMucGxheWVySUQgPSBkYXRhLnBsYXllcklEO1xuICAgIHRoaXMudXNlcm5hbWUgPSBkYXRhLnVzZXJuYW1lO1xuICAgIHRoaXMuaXNCb3QgPSBkYXRhLmlzQm90O1xuICAgIHRoaXMucGxhdGZvcm0gPSBkYXRhLnBsYXRmb3JtO1xuICAgIHRoaXMuc2tpbiA9IGRhdGEuc2tpbjtcbiAgICB0aGlzLnNuaXBlcyA9IGRhdGEuc25pcGVzO1xuICB9XG59XG5cbmV4cG9ydCB7IFBsYXllciB9O1xuIiwiaW1wb3J0IHtEYXRhYmFzZSBhcyBzcWxpdGV9IGZyb20gJ3NxbGl0ZTMnO1xuaW1wb3J0IHtHYW1lRWxpbWluYXRpb259IGZyb20gJy4vbW9kZWxzL0dhbWVFbGltaW5hdGlvbic7XG5pbXBvcnQge0dhbWVQbGF5ZXJ9IGZyb20gJy4vbW9kZWxzL0dhbWVQbGF5ZXInO1xuaW1wb3J0IHtHYW1lU3RhdH0gZnJvbSAnLi9tb2RlbHMvR2FtZVN0YXQnO1xuaW1wb3J0IHtQbGF5ZXJ9IGZyb20gJy4vbW9kZWxzL1BsYXllcic7XG5cbmNvbnN0IGluaXRTdGF0ZW1lbnRzID0gW1xuICBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJ0dhbWVFbGltaW5hdGlvbnMnIChcbiAgICAnaWQnIElOVEVHRVIgUFJJTUFSWSBLRVkgQVVUT0lOQ1JFTUVOVCxcbiAgICAnZ2FtZUlEJyBWQVJDSEFSKDI1NSkgTk9UIE5VTEwsXG4gICAgJ3RpbWUnIElOVEVHRVIgTk9UIE5VTEwsXG4gICAgJ2tpbGxlcklEJyBWQVJDSEFSKDI1NSkgTk9UIE5VTEwsXG4gICAgJ2tpbGxlZElEJyBWQVJDSEFSKDI1NSkgTk9UIE5VTEwsXG4gICAgJ2tub2NrZWQnIFRJTllJTlQoMSkgTk9UIE5VTEwsXG4gICAgJ3dlYXBvbicgVkFSQ0hBUigyNTUpIE5PVCBOVUxMXG4gIClgLFxuICBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJ0dhbWVQbGF5ZXJzJyAoXG4gICAgJ2lkJyBJTlRFR0VSIFBSSU1BUlkgS0VZIEFVVE9JTkNSRU1FTlQsXG4gICAgJ3BsYXllcklEJyBWQVJDSEFSKDI1NSkgTk9UIE5VTEwsXG4gICAgJ2dhbWVJRCcgVkFSQ0hBUigyNTUpIE5PVCBOVUxMLFxuICAgICdpc0JvdCcgVElOWUlOVCgxKSBOT1QgTlVMTCxcbiAgICAndGVhbScgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAna2lsbHMnIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAwLFxuICAgICdwbGFjZW1lbnQnIElOVEVHRVIgTk9UIE5VTExcbiAgKWAsXG4gIGBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAnR2FtZVN0YXRzJyAoXG4gICAgJ2dhbWVJRCcgVkFSQ0hBUigyNTUpIE5PVCBOVUxMIFVOSVFVRSBQUklNQVJZIEtFWSxcbiAgICAnb3duZXInIFZBUkNIQVIoMjU1KSBOT1QgTlVMTCxcbiAgICAndGltZXN0YW1wJyBEQVRFVElNRSBOT1QgTlVMTCBVTklRVUUsXG4gICAgJ3JlcGxheU5hbWUnIFZBUkNIQVIoMjU1KSBOT1QgTlVMTCxcbiAgICAnbW9kZScgVkFSQ0hBUigyNTUpIE5PVCBOVUxMLFxuICAgICdib3RzJyBJTlRFR0VSIE5PVCBOVUxMLFxuICAgICdwbGF5ZXJzJyBJTlRFR0VSIE5PVCBOVUxMLFxuICAgICdkdXJhdGlvbicgSU5URUdFUiBERUZBVUxUIC0xLFxuICAgICdwbGFjZW1lbnQnIElOVEVHRVIgTk9UIE5VTEwsXG4gICAgJ2tpbGxzJyBJTlRFR0VSIERFRkFVTFQgLTEsXG4gICAgJ2Fzc2lzdHMnIElOVEVHRVIgREVGQVVMVCAwLFxuICAgICdhY2N1cmFjeScgRE9VQkxFIFBSRUNJU0lPTiBERUZBVUxUICctMScsXG4gICAgJ2RhbWFnZURlYWx0JyBJTlRFR0VSIERFRkFVTFQgLTEsXG4gICAgJ2RhbWFnZVRha2VuJyBJTlRFR0VSIERFRkFVTFQgLTEsXG4gICAgJ2Rpc3RhbmNlVHJhdmVsbGVkJyBET1VCTEUgUFJFQ0lTSU9OIERFRkFVTFQgJy0xJ1xuICApYCxcbiAgYENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICdQbGF5ZXJzJyAoXG4gICAgJ3BsYXllcklEJyBWQVJDSEFSKDI1NSkgTk9UIE5VTEwgVU5JUVVFIFBSSU1BUlkgS0VZLFxuICAgICd1c2VybmFtZScgVkFSQ0hBUigyNTUpIE5PVCBOVUxMLFxuICAgICdpc0JvdCcgVkFSQ0hBUigyNTUpIE5PVCBOVUxMLFxuICAgICdwbGF0Zm9ybScgVkFSQ0hBUigyNTUpLFxuICAgICdza2luJyBWQVJDSEFSKDI1NSksXG4gICAgJ3NuaXBlcycgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDFcbiAgKWAsXG5dO1xuXG5hc3luYyBmdW5jdGlvbiBnZXRBbGwoc3FsOnN0cmluZyk6UHJvbWlzZTxhbnlbXT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgIGRiLmRhdGFiYXNlLmFsbChzcWwsIGZ1bmN0aW9uIChlcnIsIHJvd3MpIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgY29uc29sZS5sb2coZXJyKTtcbiAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgfVxuICAgICAgcmVzb2x2ZShyb3dzKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNlcmlhbGl6ZShzcWw6c3RyaW5nW10pOlByb21pc2U8Ym9vbGVhbj4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGRiLmRhdGFiYXNlLnNlcmlhbGl6ZSgoKSA9PiB7XG4gICAgICBmdW5jdGlvbiBkYlJ1bih4Om51bWJlcikge1xuICAgICAgICBpZiAoeCA8IHNxbC5sZW5ndGgpIHtcbiAgICAgICAgICBkYi5kYXRhYmFzZS5ydW4oc3FsW3hdLCAoZXJyKSA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGVycik7XG4gICAgICAgICAgICAgIHJldHVybiByZWplY3QoZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7IGRiUnVuKCsreCk7IH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXNvbHZlKHRydWUpO1xuICAgICAgfVxuICAgICAgZGJSdW4oMCk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBleGVjKHNxbDpzdHJpbmcpOlByb21pc2U8Ym9vbGVhbj4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgIGRiLmRhdGFiYXNlLmV4ZWMoc3FsLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGVycik7XG4gICAgICAgIHJldHVybiByZWplY3QoZmFsc2UpO1xuICAgICAgfVxuICAgICAgcmVzb2x2ZSh0cnVlKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFNpbmdsZShzcWw6c3RyaW5nKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgZGIuZGF0YWJhc2UuZ2V0KHNxbCwgZnVuY3Rpb24gKGVyciwgcm93cykge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBjb25zb2xlLmxvZyhlcnIpO1xuICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICB9XG4gICAgICByZXNvbHZlKHJvd3MpO1xuICAgIH0pO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gd2hlcmVJbkdlbmVyYXRvcihkYXRhOnN0cmluZ1tdKSB7XG4gIHJldHVybiBgKCR7J1xcJycgKyBkYXRhLmpvaW4oJ1xcJyxcXCcnKSArICdcXCcnfSlgO1xufVxuXG5jbGFzcyBEYXRhYmFzZSB7XG4gIGRhdGFiYXNlOiBzcWxpdGU7XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5kYXRhYmFzZSA9IG5ldyBzcWxpdGUoJ2RhdGFiYXNlLmRiJywgKGVycikgPT4ge1xuICAgICAgaWYgKGVycikgY29uc29sZS5lcnJvcignRGF0YWJhc2Ugb3BlbmluZyBlcnJvcjogJywgZXJyKTtcbiAgICB9KTtcbiAgICBpbml0U3RhdGVtZW50cy5mb3JFYWNoKChzcWwpID0+IHtcbiAgICAgIHRoaXMuZGF0YWJhc2UucnVuKHNxbCk7XG4gICAgfSk7XG4gIH1cblxuICBhZGRSZXBsYXkgPSBhc3luYyAoZ2FtZXJzOkdhbWVQbGF5ZXJbXSwga2lsbHM6R2FtZUVsaW1pbmF0aW9uW10sIHBsYXllcnM6UGxheWVyW10sIHN0YXQ6R2FtZVN0YXQpID0+IHtcbiAgICBmdW5jdGlvbiBlc2NhcGUobGluZTpzdHJpbmcpIHtcbiAgICAgIHJldHVybiBsaW5lLnJlcGxhY2VBbGwoXCInXCIsIFwiJydcIik7XG4gICAgfVxuICAgIGxldCBzcWw6c3RyaW5nO1xuICAgIHNxbCA9IGBJTlNFUlQgSU5UTyBHYW1lU3RhdHMgVkFMVUVTICgnJHtzdGF0LmdhbWVJRH0nLCAnJHtzdGF0Lm93bmVyfScsICcke3N0YXQudGltZXN0YW1wLnRvSVNPU3RyaW5nKCl9JywgJyR7ZXNjYXBlKHN0YXQucmVwbGF5TmFtZSl9JywgJyR7c3RhdC5tb2RlfScsICR7c3RhdC5ib3RzfSwgJHtzdGF0LnBsYXllcnN9LCAke3N0YXQuZHVyYXRpb259LCAke3N0YXQucGxhY2VtZW50fSwgJHtzdGF0LmtpbGxzfSwgJHtzdGF0LmFzc2lzdHN9LCAke3N0YXQuYWNjdXJhY3l9LCAke3N0YXQuZGFtYWdlRGVhbHR9LCAke3N0YXQuZGFtYWdlVGFrZW59LCAke3N0YXQuZGlzdGFuY2VUcmF2ZWxsZWR9KWA7XG4gICAgaWYgKCFhd2FpdCBleGVjKHNxbCkpIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgc3FsID0gYElOU0VSVCBJTlRPIEdhbWVQbGF5ZXJzIFZBTFVFUyAke2dhbWVycy5tYXAoZyA9PiBgKE5VTEwsICcke2cucGxheWVySUR9JywgJyR7Zy5nYW1lSUR9JywgJHtnLmlzQm90ID8gMSA6IDB9LCAke2cudGVhbX0sICR7Zy5raWxsc30sICR7Zy5wbGFjZW1lbnR9KWApLmpvaW4oJywgJyl9YDtcbiAgICBpZiAoIWF3YWl0IGV4ZWMoc3FsKSkgeyByZXR1cm4gZmFsc2U7IH1cbiAgICBpZiAoa2lsbHMubGVuZ3RoID4gMCkge1xuICAgICAgc3FsID0gYElOU0VSVCBJTlRPIEdhbWVFbGltaW5hdGlvbnMgVkFMVUVTICR7a2lsbHMubWFwKGsgPT4gYChOVUxMLCAnJHtrLmdhbWVJRH0nLCAke2sudGltZX0sICcke2sua2lsbGVySUR9JywgJyR7ay5raWxsZWRJRH0nLCAke2sua25vY2tlZH0sICcke2sud2VhcG9ufScpYCkuam9pbignLCAnKX1gO1xuICAgICAgaWYgKCFhd2FpdCBleGVjKHNxbCkpIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgfVxuICAgIGNvbnN0IHNlcmlhbGl6ZXFsOnN0cmluZ1tdID0gW107XG4gICAgY29uc3QgcGxheWVyU3FsOnN0cmluZ1tdID0gW107XG4gICAgZm9yIChsZXQgeCA9IDA7IHggPCBwbGF5ZXJzLmxlbmd0aDsgeCsrKSB7XG4gICAgICBjb25zdCBwID0gcGxheWVyc1t4XTtcbiAgICAgIGNvbnN0IGV4aXN0aW5nUGxheWVyID0gYXdhaXQgdGhpcy5nZXRQbGF5ZXIocC5wbGF5ZXJJRCk7XG4gICAgICBjb25zdCBwbGF0Zm9ybSA9IHAucGxhdGZvcm0gPT0gbnVsbCA/ICdOVUxMJyA6IGAnJHtwLnBsYXRmb3JtfSdgO1xuICAgICAgbGV0IHNraW4gPSBwLnNraW4gPT0gbnVsbCA/ICdOVUxMJyA6IGAnJHtwLnNraW59J2A7XG4gICAgICBpZiAoZXhpc3RpbmdQbGF5ZXIucGxheWVySUQubGVuZ3RoID4gMCkge1xuICAgICAgICBpZiAoZXhpc3RpbmdQbGF5ZXIuc2tpbiAhPSBudWxsICYmIHNraW4gPT0gJ05VTEwnKSB7XG4gICAgICAgICAgc2tpbiA9IGV4aXN0aW5nUGxheWVyLnNraW47XG4gICAgICAgIH1cbiAgICAgICAgc2VyaWFsaXplcWwucHVzaChgVVBEQVRFIFBsYXllcnMgU0VUIHNuaXBlcyA9IHNuaXBlcyArIDEsIHBsYXRmb3JtID0gJHtwbGF0Zm9ybX0sIHVzZXJuYW1lID0gJyR7ZXNjYXBlKHAudXNlcm5hbWUpfScsIHNraW4gPSAke3NraW59IFdIRVJFIHBsYXllcklEID0gJyR7cC5wbGF5ZXJJRH0nYCk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgcGxheWVyU3FsLnB1c2goYCgnJHtwLnBsYXllcklEfScsICcke2VzY2FwZShwLnVzZXJuYW1lKX0nLCAke3AuaXNCb3R9LCAke3BsYXRmb3JtfSwgJHtza2lufSwgJHtwLnNuaXBlc30pYCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChwbGF5ZXJTcWwubGVuZ3RoID4gMCkge1xuICAgICAgc3FsID0gKGBJTlNFUlQgSU5UTyBQbGF5ZXJzIFZBTFVFUyAke3BsYXllclNxbC5qb2luKCcsICcpfWApO1xuICAgICAgaWYgKCFhd2FpdCBleGVjKHNxbCkpIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgfVxuICAgIHJldHVybiBhd2FpdCBzZXJpYWxpemUoc2VyaWFsaXplcWwpO1xuICB9O1xuXG4gIGdldE1hdGNoSGlzdG9yeSA9IGFzeW5jIChwYWdlID0gMSk6UHJvbWlzZTxHYW1lU3RhdFtdPiA9PiB7XG4gICAgY29uc3QgbGltaXQgPSAyNTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZXRBbGwoYFNFTEVDVCAqIEZST00gR2FtZVN0YXRzIE9SREVSIEJZIHRpbWVzdGFtcCBERVNDIExJTUlUICR7bGltaXR9IE9GRlNFVCAkeyhsaW1pdCAqIHBhZ2UpIC0gbGltaXR9YCk7XG4gICAgY29uc3QgbWF0Y2hlczpHYW1lU3RhdFtdID0gW107XG4gICAgcmVzdWx0LmZvckVhY2goZSA9PiB7XG4gICAgICBtYXRjaGVzLnB1c2gobmV3IEdhbWVTdGF0KGUpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gbWF0Y2hlcztcbiAgfTtcblxuICBnZXRHYW1lckhpc3RvcnkgPSBhc3luYyAocGFnZSA9IDEsIHBsYXllcklEOnN0cmluZyk6UHJvbWlzZTxHYW1lU3RhdFtdPiA9PiB7XG4gICAgY29uc3QgbGltaXQgPSAyNTtcbiAgICBjb25zdCBtYXRjaGVzOkdhbWVTdGF0W10gPSBbXTtcbiAgICBjb25zdCBnYW1lckdhbWVzID0gYXdhaXQgZ2V0QWxsKGBTRUxFQ1QgZ2FtZUlEIEZST00gR2FtZVBsYXllcnMgV0hFUkUgcGxheWVySUQgPSAnJHtwbGF5ZXJJRH0nYCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2V0QWxsKGBTRUxFQ1QgKiBGUk9NIEdhbWVTdGF0cyBXSEVSRSBnYW1lSUQgSU4gJHt3aGVyZUluR2VuZXJhdG9yKGdhbWVyR2FtZXMubWFwKGcgPT4gZy5nYW1lSUQpKX0gT1JERVIgQlkgdGltZXN0YW1wIERFU0MgTElNSVQgJHtsaW1pdH0gT0ZGU0VUICR7KGxpbWl0ICogcGFnZSkgLSBsaW1pdH1gKTtcbiAgICByZXN1bHQuZm9yRWFjaChlID0+IHtcbiAgICAgIG1hdGNoZXMucHVzaChuZXcgR2FtZVN0YXQoZSkpO1xuICAgIH0pO1xuICAgIHJldHVybiBtYXRjaGVzO1xuICB9O1xuXG4gIGdldEVsaW1pbmF0aW9ucyA9IGFzeW5jIChnYW1lSUQ6IHN0cmluZyk6IFByb21pc2U8R2FtZUVsaW1pbmF0aW9uW10+ID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZXRBbGwoYFNFTEVDVCAqIEZST00gR2FtZUVsaW1pbmF0aW9ucyBXSEVSRSBnYW1lSUQ9JyR7Z2FtZUlEfScgT1JERVIgQlkgaWRgKTtcbiAgICBjb25zdCBlbGltaW5hdGlvbnM6R2FtZUVsaW1pbmF0aW9uW10gPSBbXTtcbiAgICByZXN1bHQuZm9yRWFjaChlID0+IHtcbiAgICAgIGVsaW1pbmF0aW9ucy5wdXNoKG5ldyBHYW1lRWxpbWluYXRpb24oZSkpO1xuICAgIH0pO1xuICAgIHJldHVybiBlbGltaW5hdGlvbnM7XG4gIH07XG5cbiAgZ2V0R2FtZXJzID0gYXN5bmMgKGdhbWVJRDogc3RyaW5nKTogUHJvbWlzZTxHYW1lUGxheWVyW10+ID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZXRBbGwoYFNFTEVDVCAqIEZST00gR2FtZVBsYXllcnMgV0hFUkUgZ2FtZUlEPScke2dhbWVJRH0nIE9SREVSIEJZIHRlYW1gKTtcbiAgICBjb25zdCBnYW1lcnM6R2FtZVBsYXllcltdID0gW107XG4gICAgcmVzdWx0LmZvckVhY2goZSA9PiB7XG4gICAgICBnYW1lcnMucHVzaChuZXcgR2FtZVBsYXllcihlKSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGdhbWVycztcbiAgfTtcblxuICBnZXRHYW1lclBsYXllcnMgPSAgYXN5bmMgKGdhbWVyczogR2FtZVBsYXllcltdKTogUHJvbWlzZTxQbGF5ZXJbXT4gPT4ge1xuICAgIGNvbnN0IGZpbHRlcmVkID0gZ2FtZXJzLm1hcChnID0+IGAke2cucGxheWVySUR9YCk7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2V0QWxsKGBTRUxFQ1QgKiBGUk9NIFBsYXllcnMgV0hFUkUgcGxheWVySUQgSU4gJHt3aGVyZUluR2VuZXJhdG9yKGZpbHRlcmVkKX1gKTtcbiAgICBjb25zdCBwbGF5ZXJzOlBsYXllcltdID0gW107XG4gICAgcmVzdWx0LmZvckVhY2goZSA9PiB7XG4gICAgICBwbGF5ZXJzLnB1c2gobmV3IFBsYXllcihlKSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHBsYXllcnM7XG4gIH07XG5cbiAgZ2V0R2FtZVN0YXRzID0gYXN5bmMgKGdhbWVJRDogc3RyaW5nKTogUHJvbWlzZTxHYW1lU3RhdD4gPT4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGdldFNpbmdsZShgU0VMRUNUICogRlJPTSBHYW1lU3RhdHMgV0hFUkUgZ2FtZUlEPScke2dhbWVJRH0nYCk7XG4gICAgcmV0dXJuIG5ldyBHYW1lU3RhdChyZXN1bHQpO1xuICB9O1xuXG4gIGdldFBsYXllciA9IGFzeW5jIChwbGF5ZXJJRDogc3RyaW5nKTogUHJvbWlzZTxQbGF5ZXI+ID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZXRTaW5nbGUoYFNFTEVDVCAqIEZST00gUGxheWVycyBXSEVSRSBwbGF5ZXJJRD0nJHtwbGF5ZXJJRH0nYCk7XG4gICAgcmV0dXJuIG5ldyBQbGF5ZXIocmVzdWx0KTtcbiAgfTtcblxuICBnZXRQbGF5ZXJHYW1lcyA9IGFzeW5jIChwbGF5ZXJJRDogc3RyaW5nKTogUHJvbWlzZTxHYW1lU3RhdHNbXT4gPT4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGdldEFsbChgU0VMRUNUICogRlJPTSBHYW1lUGxheWVycyBXSEVSRSBwbGF5ZXJJRD0nJHtwbGF5ZXJJRH0nYCk7XG4gICAgY29uc3Qgc3RhdHM6R2FtZVN0YXRzW10gPSBbXTtcbiAgICByZXN1bHQuZm9yRWFjaChlID0+IHtcbiAgICAgIHN0YXRzLnB1c2gobmV3IEdhbWVTdGF0KGUpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gc3RhdHM7XG4gIH07XG5cbiAgZ2V0TGFzdEdhbWVJRCA9IGFzeW5jKCk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2V0U2luZ2xlKCdTRUxFQ1QgKiBGUk9NIEdhbWVTdGF0cyBPUkRFUiBCWSB0aW1lc3RhbXAgREVTQyBMSU1JVCAxJyk7XG4gICAgcmV0dXJuIHJlc3VsdCAhPSBudWxsID8gcmVzdWx0LmdhbWVJRCA6IG51bGw7XG4gIH07XG5cbiAgZ2V0U25pcGVycyA9IGFzeW5jKCk6IFByb21pc2U8UGxheWVyW10+ID0+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZXRBbGwoJ1NFTEVDVCAqIEZST00gUGxheWVycyBPUkRFUiBCWSBzbmlwZXMgREVTQycpO1xuICAgIGNvbnN0IHBsYXllcnM6UGxheWVyW10gPSBbXTtcbiAgICByZXN1bHQuZm9yRWFjaChlID0+IHtcbiAgICAgIHBsYXllcnMucHVzaChuZXcgUGxheWVyKGUpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcGxheWVycztcbiAgfTtcblxuICBkZWxldGVNYXRjaCA9IGFzeW5jKGdhbWVJRDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gICAgYXdhaXQgZXhlYyhgREVMRVRFIEZST00gR2FtZVN0YXRzIFdIRVJFIGdhbWVJRD0nJHtnYW1lSUR9J2ApO1xuICAgIGF3YWl0IGV4ZWMoYFVQREFURSBQbGF5ZXJzIFNFVCBzbmlwZXMgPSBzbmlwZXMgLSAxIFdIRVJFIHBsYXllcklEIElOIChTRUxFQ1QgcGxheWVySUQgRlJPTSBHYW1lUGxheWVycyBXSEVSRSBnYW1lSUQgPSAnJHtnYW1lSUR9JylgKTtcbiAgICBhd2FpdCBleGVjKGBERUxFVEUgRlJPTSBHYW1lUGxheWVycyBXSEVSRSBnYW1lSUQ9JyR7Z2FtZUlEfSdgKTtcbiAgICByZXR1cm4gYXdhaXQgZXhlYyhgREVMRVRFIEZST00gR2FtZUVsaW1pbmF0aW9ucyBXSEVSRSBnYW1lSUQ9JyR7Z2FtZUlEfSdgKTtcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IGRiID0gbmV3IERhdGFiYXNlKCk7XG4iLCJpbXBvcnQge2RifSBmcm9tICcuLi8uLi9wcmVsb2FkL3NyYy9kYXRhYmFzZSc7XG5pbXBvcnQge3JlYWRGaWxlU3luYywgY3JlYXRlV3JpdGVTdHJlYW0sIGV4aXN0c1N5bmMsIHVubGluaywgbWtkaXJTeW5jfSBmcm9tICdmcyc7XG5pbXBvcnQge0dhbWVFbGltaW5hdGlvbn0gZnJvbSAnLi4vLi4vcHJlbG9hZC9zcmMvbW9kZWxzL0dhbWVFbGltaW5hdGlvbic7XG5pbXBvcnQge0dhbWVQbGF5ZXJ9IGZyb20gJy4uLy4uL3ByZWxvYWQvc3JjL21vZGVscy9HYW1lUGxheWVyJztcbmltcG9ydCB7R2FtZVN0YXR9IGZyb20gJy4uLy4uL3ByZWxvYWQvc3JjL21vZGVscy9HYW1lU3RhdCc7XG5pbXBvcnQge1BsYXllcn0gZnJvbSAnLi4vLi4vcHJlbG9hZC9zcmMvbW9kZWxzL1BsYXllcic7XG5pbXBvcnQgRm9ydFBsYXllclN0YXRlIGZyb20gJy4vRm9ydFBsYXllclN0YXRlLmpzb24nO1xuY29uc3Qgbm9kZUZldGNoID0gcmVxdWlyZSgnbm9kZS1mZXRjaCcpO1xuY29uc3QgcGFyc2VSZXBsYXkgPSByZXF1aXJlKCdmb3J0bml0ZS1yZXBsYXktcGFyc2VyJyk7XG5jb25zdCBjbGllbnQgPSByZXF1aXJlKCdodHRwcycpO1xuY29uc3Qgc2hhcnAgPSByZXF1aXJlKCdzaGFycCcpO1xuXG5mdW5jdGlvbiBwYXJzZVBsYXllcnMocGxheWVycykge1xuICBjb25zdCByZXN1bHQ6IFBsYXllcltdID0gW107XG4gIHBsYXllcnMuZm9yRWFjaCgocCkgPT4ge1xuICAgIGlmIChyZXN1bHQuZmlsdGVyKHIgPT4gW3AuQm90VW5pcXVlSWQsIHAuVW5pcXVlSWRdLmluY2x1ZGVzKHIucGxheWVySUQpKS5sZW5ndGggPT0gMCkge1xuICAgICAgcmVzdWx0LnB1c2gobmV3IFBsYXllcih7XG4gICAgICAgIHBsYXllcklEOiBwLkJvdFVuaXF1ZUlkID8/IHAuVW5pcXVlSWQsXG4gICAgICAgIHVzZXJuYW1lOiBwLlBsYXllck5hbWVQcml2YXRlLFxuICAgICAgICBpc0JvdDogcC5iSXNBQm90ICE9IG51bGwgJiYgcC5iSXNBQm90ID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICBwbGF0Zm9ybTogcC5QbGF0Zm9ybSxcbiAgICAgICAgc2tpbjogcC5DaGFyYWN0ZXIgIT0gbnVsbCA/IHAuQ2hhcmFjdGVyLm5hbWUgOiBudWxsLFxuICAgICAgICBzbmlwZXM6IDEsXG4gICAgICB9KSk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gcGFyc2VFbGltaW5hdGlvbnMoZWxpbXMsIGdhbWVJRDpzdHJpbmcpIHtcbiAgY29uc3QgcmVzdWx0OkdhbWVFbGltaW5hdGlvbltdID0gW107XG4gIGVsaW1zLmZpbHRlcihlID0+IGUuZ3JvdXAgPT0gJ3BsYXllckVsaW0nKS5mb3JFYWNoKChlKSA9PiB7XG4gICAgICByZXN1bHQucHVzaChuZXcgR2FtZUVsaW1pbmF0aW9uKHtcbiAgICAgICAgaWQ6IDAsXG4gICAgICAgIGdhbWVJRDogZ2FtZUlELFxuICAgICAgICB0aW1lOiBlLnN0YXJ0VGltZSxcbiAgICAgICAga2lsbGVySUQ6IGUuZWxpbWluYXRvcixcbiAgICAgICAga2lsbGVkSUQ6IGUuZWxpbWluYXRlZCxcbiAgICAgICAga25vY2tlZDogZS5rbm9ja2VkLFxuICAgICAgICB3ZWFwb246IGUuZ3VuVHlwZSxcbiAgICAgIH0pKTtcbiAgfSk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIHBhcnNlU3RhdHMoZGF0YSwgY2xlYW5lZFBsYXllcnMsIGdhbWVJRDpzdHJpbmcsIHJlcGxheU5hbWU6c3RyaW5nLCBtb2RlOnN0cmluZykge1xuICBjb25zdCBhdGhlbmFTdGF0cyA9IGRhdGEuZXZlbnRzLmZpbHRlcihlID0+IGUubWV0YWRhdGEgPT0gJ0F0aGVuYU1hdGNoU3RhdHMnKS5hdCgtMSkgPz8ge1xuICAgIHN0YXJ0VGltZTogMCxcbiAgICBlbGltaW5hdGlvbnM6IDAsXG4gICAgYXNzaXN0czogMCxcbiAgICBhY2N1cmFjeTogMCxcbiAgICBkYW1hZ2VUb1BsYXllcnM6IDAsXG4gICAgZGFtYWdlVGFrZW46IDAsXG4gICAgdG90YWxUcmF2ZWxlZDogMCxcbiAgfTtcbiAgY29uc3QgaW5DcmVhdGl2ZSA9IG1vZGUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnY3JlYXRpdmUnKTtcbiAgY29uc3QgYm90Q291bnQgPSBpbkNyZWF0aXZlID8gMCA6IGNsZWFuZWRQbGF5ZXJzLmZpbHRlcihwID0+IHAuVGVhbUluZGV4ID4gMiAmJiBwLmJJc0FCb3QgIT0gbnVsbCkubGVuZ3RoO1xuICBjb25zdCBwbGF5ZXJDb3VudCA9IGNsZWFuZWRQbGF5ZXJzLmZpbHRlcihwID0+IHAuVGVhbUluZGV4ID4gMiAmJiBwLmJJc0FCb3QgPT0gbnVsbCkubGVuZ3RoO1xuICBjb25zdCBvd25lcklEID0gY2xlYW5lZFBsYXllcnMuZmlsdGVyKHAgPT4gcC5Pd25lciAhPSBudWxsKVswXS5VbmlxdWVJZDtcbiAgY29uc3QgZ2FtZUR1cmF0aW9uID0gTWF0aC5tYXgoYXRoZW5hU3RhdHMuc3RhcnRUaW1lLCBkYXRhLmV2ZW50cy5hdCgtMSkuc3RhcnRUaW1lKTtcbiAgcmV0dXJuIG5ldyBHYW1lU3RhdCh7XG4gICAgZ2FtZUlEOiBnYW1lSUQsXG4gICAgb3duZXI6IG93bmVySUQsXG4gICAgdGltZXN0YW1wOiBuZXcgRGF0ZShkYXRhLmluZm8uVGltZXN0YW1wKSxcbiAgICByZXBsYXlOYW1lOiByZXBsYXlOYW1lLFxuICAgIG1vZGU6IG1vZGUsXG4gICAgYm90czogYm90Q291bnQsXG4gICAgcGxheWVyczogcGxheWVyQ291bnQsXG4gICAgZHVyYXRpb246IGdhbWVEdXJhdGlvbixcbiAgICBwbGFjZW1lbnQ6IGluQ3JlYXRpdmUgPyAwIDogY2xlYW5lZFBsYXllcnMuZmlsdGVyKHAgPT4gcC5VbmlxdWVJZCA9PSBvd25lcklEKVswXS5QbGFjZSA/PyAwLFxuICAgIGtpbGxzOiBpbkNyZWF0aXZlID8gMCA6IGF0aGVuYVN0YXRzLmVsaW1pbmF0aW9ucyxcbiAgICBhc3Npc3RzOiBpbkNyZWF0aXZlID8gMCA6IGF0aGVuYVN0YXRzLmFzc2lzdHMsXG4gICAgYWNjdXJhY3k6IGluQ3JlYXRpdmUgPyAwIDogYXRoZW5hU3RhdHMuYWNjdXJhY3ksXG4gICAgZGFtYWdlRGVhbHQ6IGluQ3JlYXRpdmUgPyAwIDogYXRoZW5hU3RhdHMuZGFtYWdlVG9QbGF5ZXJzLFxuICAgIGRhbWFnZVRha2VuOiBpbkNyZWF0aXZlID8gMCA6IGF0aGVuYVN0YXRzLmRhbWFnZVRha2VuLFxuICAgIGRpc3RhbmNlVHJhdmVsbGVkOiBpbkNyZWF0aXZlID8gMCA6IGF0aGVuYVN0YXRzLnRvdGFsVHJhdmVsZWQsXG4gIH0pO1xufVxuXG5mdW5jdGlvbiBwYXJzZUdhbWVycyhkYXRhUGxheWVycywgcGxheWVyczpQbGF5ZXJbXSwgZ2FtZUlEOnN0cmluZywgbW9kZTpzdHJpbmcpIHtcbiAgY29uc3QgZ2FtZXJzOkdhbWVQbGF5ZXJbXSA9IFtdO1xuICBjb25zdCBpbkNyZWF0aXZlID0gbW9kZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdjcmVhdGl2ZScpO1xuICBwbGF5ZXJzLmZvckVhY2goKHApID0+IHtcbiAgICBjb25zdCBkYXRhUGxheWVyID0gZGF0YVBsYXllcnMuZmlsdGVyKGRwID0+IGRwLlVuaXF1ZUlkID09IHAucGxheWVySUQgfHwgZHAuQm90VW5pcXVlSWQgPT0gcC5wbGF5ZXJJRClbMF07XG4gICAgbGV0IHRlYW1QbGFjZW1lbnQgPSBpbkNyZWF0aXZlID8gMCA6IE1hdGgubWluKC4uLmRhdGFQbGF5ZXJzXG4gICAgICAuZmlsdGVyKGRwID0+IGRwLlRlYW1JbmRleCA9PSBkYXRhUGxheWVyLlRlYW1JbmRleCAmJiBkcC5QbGFjZSAhPSBudWxsKVxuICAgICAgLm1hcChkcCA9PiBkcC5QbGFjZSkpO1xuICAgIHRlYW1QbGFjZW1lbnQgPSB0ZWFtUGxhY2VtZW50ID09IEluZmluaXR5ID8gMCA6IHRlYW1QbGFjZW1lbnQ7XG4gICAgZ2FtZXJzLnB1c2gobmV3IEdhbWVQbGF5ZXIoe1xuICAgICAgaWQ6IDAsXG4gICAgICBwbGF5ZXJJRDogcC5wbGF5ZXJJRCxcbiAgICAgIGdhbWVJRDogZ2FtZUlELFxuICAgICAgaXNCb3Q6IHAuaXNCb3QsXG4gICAgICB0ZWFtOiBkYXRhUGxheWVyLlRlYW1JbmRleCAhPSBudWxsID8gZGF0YVBsYXllci5UZWFtSW5kZXggLSAyIDogLTEsXG4gICAgICBraWxsczogZGF0YVBsYXllci5LaWxsU2NvcmUgPz8gMCxcbiAgICAgIHBsYWNlbWVudDogdGVhbVBsYWNlbWVudCxcbiAgICB9KSk7XG4gIH0pO1xuICByZXR1cm4gZ2FtZXJzO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkb3dubG9hZFNraW5zKHBsYXllcnM6UGxheWVyW10pIHtcbiAgZnVuY3Rpb24gZG93bmxvYWRJbWFnZSh1cmw6c3RyaW5nLCBmaWxlcGF0aDpzdHJpbmcpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY2xpZW50LmdldCh1cmwsIChyZXMpID0+IHtcbiAgICAgICAgaWYgKHJlcy5zdGF0dXNDb2RlID09PSAyMDApIHtcbiAgICAgICAgICByZXMucGlwZShjcmVhdGVXcml0ZVN0cmVhbShmaWxlcGF0aCkpXG4gICAgICAgICAgICAub24oJ2Vycm9yJywgcmVqZWN0KVxuICAgICAgICAgICAgLm9uY2UoJ2Nsb3NlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICBhd2FpdCBzaGFycChmaWxlcGF0aCkucmVzaXplKDY0KS50b0ZpbGUoZmlsZXBhdGgucmVwbGFjZSgnX3Jhd0ZpbGUnLCAnJykpO1xuICAgICAgICAgICAgICB1bmxpbmsoZmlsZXBhdGgsIChlcnIpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7IHJlamVjdChmYWxzZSk7IH1cbiAgICAgICAgICAgICAgICByZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlcy5yZXN1bWUoKTtcbiAgICAgICAgICByZWplY3QoZmFsc2UpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IHNraW5zID0gcGxheWVycy5maWx0ZXIocCA9PiBwLnNraW4gIT0gbnVsbCkubWFwKHAgPT4gcC5za2luKTtcbiAgbGV0IHNraW5Gb2xkZXI6c3RyaW5nO1xuICBpZiAoaW1wb3J0Lm1ldGEuZW52LkRFVikge1xuICAgIHNraW5Gb2xkZXIgPSBgJHtfX2Rpcm5hbWUuc3BsaXQoJ1xcXFwnKS5zbGljZSgwLCAtMikuam9pbignLycpfS9yZW5kZXJlci9hc3NldHMvc2tpbnMvYDtcbiAgfVxuICBlbHNlIHtcbiAgICBza2luRm9sZGVyID0gYCR7X19kaXJuYW1lLnNwbGl0KCdcXFxcJykuc2xpY2UoMCwgLTIpLmpvaW4oJy8nKX0vYXNzZXRzL3NraW5zL2A7XG4gIH1cbiAgaWYgKCFleGlzdHNTeW5jKHNraW5Gb2xkZXIpKSB7XG4gICAgbWtkaXJTeW5jKHNraW5Gb2xkZXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICB9XG4gIGZvciAobGV0IHggPSAwOyB4IDwgc2tpbnMubGVuZ3RoOyB4KyspIHtcbiAgICBjb25zdCBza2luUGF0aCA9IHNraW5Gb2xkZXIgKyBza2luc1t4XSArICcucG5nJztcbiAgICBjb25zdCBleGlzdHMgPSBleGlzdHNTeW5jKGAke3NraW5QYXRofWApO1xuICAgIGlmICghZXhpc3RzKSB7XG4gICAgICBjb25zdCB1cmwgPSBgaHR0cHM6Ly9mb3J0bml0ZS1hcGkuY29tL3YyL2Nvc21ldGljcy9ici8ke3NraW5zW3hdfWA7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBub2RlRmV0Y2godXJsKTtcbiAgICAgIGNvbnN0IGpib2R5ID0gYXdhaXQgcmVzLmpzb24oKTtcbiAgICAgIGlmIChqYm9keS5kYXRhICE9IG51bGwgJiYgYXdhaXQgZG93bmxvYWRJbWFnZShqYm9keS5kYXRhLmltYWdlcy5zbWFsbEljb24sIGAke3NraW5Gb2xkZXIgKyBza2luc1t4XSArICdfcmF3RmlsZS5wbmcnfWApID09IGZhbHNlKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdGYWlsZWQgdG8gZG93bmxvYWQgc2tpbi4nKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFkZFJlcGxheShwYXRoOnN0cmluZykge1xuICBjb25zdCByZXBsYXlOYW1lID0gcGF0aC5zcGxpdCgnXFxcXCcpLnBvcCgpID8/ICdJbnZhbGlkIFJlcGxheSBOYW1lJztcbiAgY29uc3QgZGF0YSA9IGF3YWl0IHBhcnNlUmVwbGF5KHJlYWRGaWxlU3luYyhwYXRoKSwge1xuICAgIGN1c3RvbU5ldEZpZWxkRXhwb3J0czogW0ZvcnRQbGF5ZXJTdGF0ZV0sXG4gICAgcGFyc2VMZXZlbDogMSxcbiAgICBkZWJ1ZzogZmFsc2UsXG4gIH0pLmNhdGNoKChfOkVycm9yKSA9PiB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH0pO1xuICBpZiAoZGF0YSA9PSBudWxsKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGdhbWVJRDpzdHJpbmcgPSBkYXRhLmdhbWVEYXRhLmdhbWVTdGF0ZS5HYW1lU2Vzc2lvbklkO1xuICBpZiAoKGF3YWl0IGRiLmdldEdhbWVTdGF0cyhnYW1lSUQpKS5nYW1lSUQubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIGNvbnN0IG1vZGU6c3RyaW5nID0gZGF0YS5nYW1lRGF0YS5wbGF5bGlzdEluZm87XG4gIGNvbnN0IGNsZWFuZWRQbGF5ZXJzID0gZGF0YS5nYW1lRGF0YS5wbGF5ZXJzLmZpbHRlcihwID0+IHAuQm90VW5pcXVlSWQgIT0gbnVsbCB8fCBwLlVuaXF1ZUlkICE9IG51bGwpO1xuXHRjb25zdCBwbGF5ZXJzID0gcGFyc2VQbGF5ZXJzKGNsZWFuZWRQbGF5ZXJzKTtcblx0Y29uc3Qga2lsbHMgPSBwYXJzZUVsaW1pbmF0aW9ucyhkYXRhLmV2ZW50cywgZ2FtZUlEKTtcblx0Y29uc3Qgc3RhdCA9IHBhcnNlU3RhdHMoZGF0YSwgY2xlYW5lZFBsYXllcnMsIGdhbWVJRCwgcmVwbGF5TmFtZSwgbW9kZSk7XG4gIGNvbnN0IGdhbWVycyA9IHBhcnNlR2FtZXJzKGNsZWFuZWRQbGF5ZXJzLCBwbGF5ZXJzLCBnYW1lSUQsIG1vZGUpO1xuICBhd2FpdCBkb3dubG9hZFNraW5zKHBsYXllcnMpO1xuICByZXR1cm4gYXdhaXQgZGIuYWRkUmVwbGF5KGdhbWVycywga2lsbHMsIHBsYXllcnMsIHN0YXQpO1xufVxuIiwiaW1wb3J0IHthcHAsIGlwY01haW4sIGRpYWxvZ30gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0ICcuL3NlY3VyaXR5LXJlc3RyaWN0aW9ucyc7XG5pbXBvcnQge3Jlc3RvcmVPckNyZWF0ZVdpbmRvd30gZnJvbSAnL0AvbWFpbldpbmRvdyc7XG5pbXBvcnQge3dhdGNofSBmcm9tICdjaG9raWRhcic7XG5pbXBvcnQge2FkZFJlcGxheX0gZnJvbSAnLi9yZXBsYXlQYXJzZXInO1xuXG5sZXQgd2luZG93OkVsZWN0cm9uLkJyb3dzZXJXaW5kb3c7XG5cbmNvbnN0IGlzU2luZ2xlSW5zdGFuY2UgPSBhcHAucmVxdWVzdFNpbmdsZUluc3RhbmNlTG9jaygpO1xuaWYgKCFpc1NpbmdsZUluc3RhbmNlKSB7XG4gIGFwcC5xdWl0KCk7XG4gIHByb2Nlc3MuZXhpdCgwKTtcbn1cbmFwcC5vbignc2Vjb25kLWluc3RhbmNlJywgcmVzdG9yZU9yQ3JlYXRlV2luZG93KTtcblxuLy9hcHAuZGlzYWJsZUhhcmR3YXJlQWNjZWxlcmF0aW9uKCk7XG5cbmFwcC5vbignd2luZG93LWFsbC1jbG9zZWQnLCAoKSA9PiB7XG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtICE9PSAnZGFyd2luJykge1xuICAgIGFwcC5xdWl0KCk7XG4gIH1cbn0pO1xuXG5hcHAub24oJ2FjdGl2YXRlJywgcmVzdG9yZU9yQ3JlYXRlV2luZG93KTtcblxuYXBwXG4gIC53aGVuUmVhZHkoKVxuICAudGhlbihhc3luYyAoKSA9PiB7d2luZG93ID0gYXdhaXQgcmVzdG9yZU9yQ3JlYXRlV2luZG93KCk7fSlcbiAgLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcignRmFpbGVkIGNyZWF0ZSB3aW5kb3c6JywgZSkpO1xuXG5cbmZ1bmN0aW9uIHJlc29sdmVUb0Fic29sdXRlUGF0aChwYXRoKSB7XG4gIHJldHVybiBwYXRoLnJlcGxhY2UoLyUoW14lXSspJS9nLCBmdW5jdGlvbiAoXywga2V5KSB7XG4gICAgcmV0dXJuIHByb2Nlc3MuZW52W2tleV07XG4gIH0pO1xufVxuXG5jb25zdCByZXBsYXlGb2xkZXIgPSByZXNvbHZlVG9BYnNvbHV0ZVBhdGgoJyVMT0NBTEFQUERBVEElXFxcXEZvcnRuaXRlR2FtZVxcXFxTYXZlZFxcXFxEZW1vcycpO1xuXG53YXRjaChyZXBsYXlGb2xkZXIsIHtcbiAgYXdhaXRXcml0ZUZpbmlzaDoge1xuICAgIHN0YWJpbGl0eVRocmVzaG9sZDogMTAwMCxcbiAgfSxcbn0pLm9uKCdjaGFuZ2UnLCBhc3luYyAocGF0aCkgPT4ge1xuICBjb25zdCByZXN1bHQgPSBhd2FpdCBhZGRSZXBsYXkocGF0aCk7XG4gIGlmIChyZXN1bHQpIHtcbiAgICB3aW5kb3cucmVsb2FkKCk7XG4gIH1cbn0pO1xuXG5pcGNNYWluLmhhbmRsZSgnYWRkUmVwbGF5JywgYXN5bmMgKF8pID0+IHtcbiAgY29uc3QgcmVzID0gYXdhaXQgZGlhbG9nLnNob3dPcGVuRGlhbG9nKHtwcm9wZXJ0aWVzOiBbJ29wZW5GaWxlJywgJ211bHRpU2VsZWN0aW9ucyddLCBkZWZhdWx0UGF0aDogcmVwbGF5Rm9sZGVyfSk7XG4gIGlmICghcmVzLmNhbmNlbGVkICYmIHJlcy5maWxlUGF0aHMubGVuZ3RoID4gMCkge1xuICAgIGZvciAobGV0IHggPSAwOyB4IDwgcmVzLmZpbGVQYXRocy5sZW5ndGg7IHgrKykge1xuICAgICAgY29uc3QgcGF0aCA9IHJlcy5maWxlUGF0aHNbeF07XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBhZGRSZXBsYXkocGF0aCk7XG4gICAgICBpZiAocmVzLmZpbGVQYXRocy5sZW5ndGggPT0gMSAmJiByZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuICdsYXN0JztcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59KTtcblxuaXBjTWFpbi5vbignY2xvc2VQcm9ncmFtJywgKCkgPT4ge1xuXHRhcHAuZXhpdCgpO1xufSk7XG5cbmlwY01haW4ub24oJ21pbmltaXplUHJvZ3JhbScsICgpID0+IHtcbiAgd2luZG93Lm1pbmltaXplKCk7XG59KTtcbiJdLCJuYW1lcyI6WyJVUkwiLCJhcHAiLCJ1cmwiLCJzaGVsbCIsInNjcmVlbiIsIkJyb3dzZXJXaW5kb3ciLCJqb2luIiwid2luZG93Iiwic3FsaXRlIiwiY3JlYXRlV3JpdGVTdHJlYW0iLCJ1bmxpbmsiLCJleGlzdHNTeW5jIiwibWtkaXJTeW5jIiwicGF0aCIsInJlYWRGaWxlU3luYyIsIndhdGNoIiwiaXBjTWFpbiIsImRpYWxvZyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQXNCQSxNQUFNLGtDQUFrQyxvQkFBSTtBQUFBLEVBRXRDLENBQUMsQ0FBQyxJQUFJQSxJQUFBQSxJQUFJLHdCQUFtQyxFQUFFLFFBQVEsb0JBQUksSUFBSyxDQUFBLENBQUM7QUFFdkU7QUFZQSxNQUFNLDJCQUEyQixvQkFBSSxJQUF5QixDQUFDLG9CQUFvQixDQUFDO0FBRXBGQyxTQUFBLElBQUksR0FBRyx3QkFBd0IsQ0FBQyxHQUFHLGFBQWE7QUFTOUMsV0FBUyxHQUFHLGlCQUFpQixDQUFDLE9BQU9DLFVBQVE7QUFDM0MsVUFBTSxFQUFDLE9BQVUsSUFBQSxJQUFJRixRQUFJRSxLQUFHO0FBQ3hCLFFBQUEsZ0NBQWdDLElBQUksTUFBTSxHQUFHO0FBQy9DO0FBQUEsSUFDRjtBQUdBLFVBQU0sZUFBZTtBQUVJO0FBQ2YsY0FBQSxLQUFLLDRDQUE0QyxR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
