(function (appUrl) {
  var maxUrlLength = 60000;

  function readText(root, selector) {
    var node = root.querySelector(selector);
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : undefined;
  }

  function readCid(root) {
    var link = root.querySelector('input.link_value');
    var match = link && link.value.match(/[?&]cid=(\d+)(?:&|$)/);
    var input = root.querySelector('input.cid');
    var value = 0;
    if (match) value = Number(match[1]);
    else if (input) value = Number(input.value);
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }

  var tables = [
    ['monster_list', 'main'], ['spell_list', 'main'], ['trap_list', 'main'],
    ['extra_list', 'extra'], ['side_list', 'side']
  ];
  if (!tables.some(function (table) { return document.querySelector('table#' + table[0]); })) {
    window.alert('公式カードデータベースのデッキ詳細ページで実行してください');
    return;
  }
  var details = {};
  document.querySelectorAll('#detailtext_main .t_row').forEach(function (row) {
    var cid = readCid(row);
    if (!cid) return;
    var detail = {
      attr: readText(row, '.box_card_attribute'),
      levelRank: readText(row, '.box_card_level_rank'),
      species: readText(row, '.card_info_species_and_other_item'),
      atk: readText(row, '.atk_power'),
      def: readText(row, '.def_power')
    };
    var textNode = row.querySelector('.box_card_text');
    if (textNode) {
      var clone = textNode.cloneNode(true);
      clone.querySelectorAll('br').forEach(function (br) { br.replaceWith('\n'); });
      detail.text = clone.textContent.split('\n').map(function (line) {
        return line.replace(/\s+/g, ' ').trim();
      }).join('\n').trim();
    }
    details[cid] = detail;
  });
  var payload = { v: 1, source: 'neuron-bookmarklet', cards: [] };
  tables.forEach(function (table) {
    document.querySelectorAll('table#' + table[0] + ' tr.row').forEach(function (row) {
      var cid = readCid(row);
      var card = {
        name: readText(row, 'td.card_name span'),
        count: Number(readText(row, 'td.num span')),
        section: table[1]
      };
      if (cid) card.cid = cid;
      if (details[cid]) card.detail = details[cid];
      payload.cards.push(card);
    });
  });

  function makeUrl() {
    var bytes = new TextEncoder().encode(JSON.stringify(payload));
    var binary = '';
    bytes.forEach(function (byte) { binary += String.fromCharCode(byte); });
    var encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return appUrl + '#import=' + encoded;
  }

  function notifyCopied() {
    window.alert('コピーしました。アプリの取り込み欄に貼り付けてください');
  }

  function copyFromTextarea(textarea) {
    textarea.focus();
    textarea.select();
    try {
      return Boolean(document.execCommand && document.execCommand('copy'));
    } catch {
      /* コピーAPIが禁止されていても手動コピー欄を残す。 */
      return false;
    }
  }

  function copyWithTextarea(json) {
    var old = document.getElementById('shodou-calc-import-copy');
    if (old) old.remove();
    var frame = document.createElement('div');
    frame.id = 'shodou-calc-import-copy';
    frame.style.cssText = 'position:fixed;inset:16px;z-index:2147483647;background:white;color:black;padding:16px;border:1px solid black;overflow:auto';
    var label = document.createElement('p');
    label.textContent = '以下の JSON をコピーして、アプリの取り込み欄に貼り付けてください。';
    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = '閉じる';
    close.onclick = function () { frame.remove(); };
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'コピー';
    var textarea = document.createElement('textarea');
    textarea.readOnly = true;
    textarea.value = json;
    textarea.setAttribute('aria-label', '取り込みJSON');
    textarea.style.cssText = 'display:block;width:100%;height:60%;box-sizing:border-box';
    frame.appendChild(label);
    frame.appendChild(copy);
    frame.appendChild(close);
    frame.appendChild(textarea);
    document.body.appendChild(frame);
    function finish() {
      frame.remove();
      notifyCopied();
    }
    /* スマートフォンでは操作の直後でないとコピーできないため、ボタンを押したときにもう一度試す。 */
    copy.onclick = function () {
      if (copyFromTextarea(textarea)) { finish(); return; }
      try {
        navigator.clipboard.writeText(json).then(finish, function () {});
      } catch {
        /* どちらも使えなければ、選択済みの欄から手動でコピーしてもらう。 */
      }
    };
    if (copyFromTextarea(textarea)) finish();
  }

  function copyPayload() {
    var json = JSON.stringify(payload);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(notifyCopied, function () {
          copyWithTextarea(json);
        });
        return;
      }
    } catch {
      /* Clipboard APIへのアクセス自体が拒否される環境では旧APIを試す。 */
    }
    copyWithTextarea(json);
  }

  var url = makeUrl();
  if (url.length > maxUrlLength) {
    payload.cards.forEach(function (card) { if (card.detail) delete card.detail.text; });
    url = makeUrl();
  }
  if (url.length > maxUrlLength) {
    payload.cards.forEach(function (card) { delete card.detail; });
    url = makeUrl();
  }
  function openApp() {
    try {
      if (window.open(url, '_blank')) return;
    } catch {
      /* 新しいタブを開けない場合は同じタブで開く。 */
    }
    /* ポップアップを止められても、同じタブでの移動なら操作の有無に関係なく開ける。 */
    try {
      window.location.assign(url);
    } catch {
      copyPayload();
    }
  }

  if (url.length <= maxUrlLength) openApp();
  else copyPayload();
})
