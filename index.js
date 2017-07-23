// index.js
const fs = require('fs');
const keypress = require('keypress');
const exec = require('child_process')
  .exec;
const readline = require('readline');
const process = require('process');

const colors = require('colors');
const wordDiffScore = require('./levenshtein');

var config = require('commander');

config
//.version('0.1.0')
  .usage('[options] <file ...>')
  .option('-p, --pattern [p]', 'pattern to match against files')
  .option('-d, --directories [v]', 'directories to search for files', (v, m) => { m.push(v); return m; }, [])
  .option('-r, --root [r]', 'place to put data files for this project')
  .option('-v, --variance [n]', 'max ammount of difference between words to consider suspicious', parseFloat)
  .parse(process.argv);

if (!config.variance) config.variance = 1;
config.files = config.args;
config.root = config.root || './';
config.variance = config.variance || 1.5;
if (config.directories) {
  config.pattern = config.pattern || '*';
  let expression = 'find -path ' + config.pattern + ' ' + config.directories.join(' '); 
  config.files.concat(execSync(expression).split(' '));
}

// set up / ensure existance of cache location
let cacheDirPath = config.root + '.codeSecretaryCache/';

if (!fs.existsSync(cacheDirPath)) {
  fs.mkdirSync(cacheDirPath, 0777);
}
// raw mode, allows actions on key press without enter key
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY)
  process.stdin.setRawMode(true);

let keys = {
  actions: new Map(),
  bind() {
    process.stdin.on('keypress', (str, key) => {
      // "Raw" mode so we must do our own kill switch
      if (key.sequence === '\u0003') {
        process.exit();
      }
      let action = this.actions.get(key.name);
      if (action) action();
    });
  },
  bindAction(word, name, done, oldWord) {
    this.actions.set(name, function() {
      confirmed.add(word);
      if (oldWord) replace(oldWord, word);
      done();
    });
  }
};
// find candidates
function matchCandidates(word) {
  let output = [];
  for (let [candidate, count] of words.get(word)) {
    if (!isPotentialCandidate(candidate, word)) continue;
    let score = wordDiffScore(word, candidate);
    if (score <= config.variance) output.push([candidate, count]);
  }
  output.sort((a, b) => b[1] - a[1]);
  return output;
}

function capitalize(string) {
  return string.charAt(0)
    .toUpperCase() + string.slice(1);
}

function isPotentialCandidate(candidate, word) {
  return !(rejected.has(candidate) || candidate == word || candidate + 's' == word || word + 's' == candidate || capitalize(candidate) == word || candidate == capitalize(word));
}
//
let words = {
  map: new Map(),
  _get(word) {
    let x = this.map.get(word[0]);
    if (!x) {
      x = new Map();
      this.map.set(word[0], x);
    }
    return x;
  },
  add(word, count) {
    let wordMap = this._get(word);
    if (!wordMap.has(word)) wordMap.set(word, count);
    else wordMap.set(word, wordMap.get(word) + count);
    if (!confirmed.has(word)) {
      this.list.push([word, count]);
    }
  },
  get(word) {
    let x = this._get(word);
    return Array.from(x.entries())
      .sort((a, b) => b[1] - a[1]);
  },
  list: [],
  getList() {
    return this.list.sort((a, b) => a[1] - b[1]);
  }
};

let confirmed = {
  name: cacheDirPath + 'confirmed',
  set: new Set(),
  load(done) {
    fs.readFile(this.name, 'utf8', function(err, data) {
      if (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      } else {
        for (let word of data.split('\n')) {
          if (word.length) {
            confirmed.set.add(word);
            words.add(word, 100000);
          }
        }
      }
      done();

    });
  },
  has(word) {
    return this.set.has(word);
  },
  add(word) {
    this.set.add(word);
    exec("echo " + word + " >> " + this.name);
  }
};

function loadSource(done) {
  let expression = "cat " + config.files.join(' ') + " | tr -c '[:alpha:]' '\\n' | sort | uniq -c | tail -n +2";
  exec(expression, null, (err, stdout, stderr) => {
    for (let y of stdout.split("\n")) {
      let [count, word] = y.trim()
        .split(' ');
      if (word && count && word.length > 3) { // four letters minimum
        words.add(word, count);
      }
    }
    done();
  });
}
// ui
function ask(word, count, candidates, done) {
  let letterCounter = 'b'.charCodeAt(0);
  candidateBindings = candidates.map((candidate) => {
    let letter = String.fromCharCode(letterCounter++);
    keys.bindAction(candidate[0], letter, done, word);
    return [candidate[0], letter];
  });
  keys.bindAction(word, 'a', done);
  console.log(word + '(a):' + candidateBindings.map(x => {
    let text = x[0] + '(' + x[1] + ') ';
    if (confirmed.has(x[0])) {
      text = text.green;
    }
    return text;
  }));
}

function askAll(list, i = 0) {
  let next = askAll.bind(null, list, i + 1);
  if (i == list.length) process.exit(); //all done!
  let [word, count] = list[i];
  if (confirmed.has(word)) next(); // word was confirmed aleady as an alternate for a previous word
  let candidates = matchCandidates(word);
  if (candidates.length) {
    ask(word, count, candidates, next);
  } else
    next();
}

function replace(from, to) {
  rejected.add(from);
  let expression = "echo " + config.files.join(' ') + " | xargs sed -i 's/" + from + "/" + to + "/g'";
  exec(expression, (err) => {
    if (err) console.log(err);
  });
}
// end ui
function start() {
  keys.bind();
  confirmed.load(loadSource.bind(null, function() {
    let list = words.getList();
    askAll(list);
  }));
}
let rejected = new Set();
let _, n, files = null;
if (process.stdin.isTTY) {
  start();
} else {
  console.log("start");
  let data = "";
  process.stdin.on('readable', function() {
    data += this.read();
  });
  process.stdin.on('end', function() {
    files = data.split(' ');
    start();
  });
}
