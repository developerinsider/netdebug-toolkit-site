/*
 * NetDebug Toolkit launch widget.
 *
 * Turns a plain link into a small form that builds a Universal Link for one of
 * the app's tools, so a reader can put in their own host/port/options and open
 * the tool pre-filled instead of copying a URL out of a code block by hand.
 *
 * Embed it by dropping a container on the page and loading this file once:
 *
 *   <div class="ndt-launch" data-tool="ping" data-target="1.1.1.1" data-count="10">
 *     <a href="https://netdebug.app/open/ping?target=1.1.1.1&amp;count=10">Open Ping in NetDebug Toolkit</a>
 *   </div>
 *   <script src="/assets/netdebug-launch.js" defer></script>
 *
 * The inner <a> is the no-JS fallback and is replaced on enhancement, so the
 * page still carries a working link for crawlers and for anyone without
 * scripting. `data-tool` picks the tool; every other data attribute pre-fills
 * the field of the same name. Unknown tools are left alone rather than being
 * replaced with a broken form.
 */
(function () {
  'use strict';

  var BASE = 'https://netdebug.app/open/';

  // Common parameters every tool accepts. Kept out of the per-tool field lists
  // so they render together in the collapsed "More options" row.
  var AUTORUN = {
    key: 'autorun', label: 'Run automatically on open', type: 'checkbox',
    def: true
  };
  var EXPORT = {
    key: 'export', label: 'Auto-export when finished', type: 'select',
    def: '',
    options: [['', 'No'], ['text', 'Text'], ['pdf', 'PDF'], ['image', 'Image']],
    hint: 'iOS only. Opens the share sheet with the finished report attached.'
  };

  function t(key, label, placeholder, hint) {
    return { key: key, label: label, type: 'text',
             placeholder: placeholder, hint: hint };
  }
  function n(key, label, placeholder, hint) {
    return { key: key, label: label, type: 'number',
             placeholder: placeholder, hint: hint };
  }
  function s(key, label, options, def, hint) {
    return { key: key, label: label, type: 'select',
             options: options, def: def, hint: hint };
  }

  var HOST = 'Host, IP or domain';

  // Mirrors the deeplink parameter table in /docs/deeplinks.html. When a tool
  // gains a parameter there, add it here too or the widget silently omits it.
  var TOOLS = {
    ping: {
      name: 'Ping', icon: '📡', fields: [
        t('target', 'Target', '1.1.1.1', HOST),
        s('method', 'Method', [['icmp', 'ICMP echo'], ['httpHead', 'HTTP HEAD']], 'icmp',
          'HTTP HEAD is useful where ICMP is blocked.'),
        n('count', 'Count', '10', '0 runs continuously until you stop it.')
      ]
    },
    http: {
      name: 'HTTP(S) Check', icon: '🌐', fields: [
        t('target', 'URL', 'https://example.com', 'Full URL including the scheme.')
      ]
    },
    speed: {
      name: 'Speed / Latency Baseline', icon: '⚡', fields: [
        s('download', 'Download size', sizes(), '32', 'Megabytes to pull.'),
        s('upload', 'Upload size', sizes(), '8', 'Megabytes to push.')
      ]
    },
    iperf3: {
      name: 'iperf3 Client', icon: '📊', fields: [
        t('target', 'Server', '192.168.1.50', 'Address of your iperf3 server.'),
        n('port', 'Port', '5201'),
        n('duration', 'Duration', '20', 'Seconds, 1 to 60.'),
        s('direction', 'Direction', [['download', 'Download'], ['upload', 'Upload']], 'download')
      ]
    },
    traceroute: {
      name: 'Traceroute', icon: '🛣', fields: [
        t('target', 'Target', 'example.com', HOST)
      ]
    },
    mtu: {
      name: 'Path MTU Discovery', icon: '📏', fields: [
        t('target', 'Target', 'example.com', HOST),
        s('family', 'IP version', [['auto', 'Auto'], ['v4', 'IPv4'], ['v6', 'IPv6']], 'auto'),
        s('mode', 'Mode', [['auto', 'Discover'], ['manual', 'Test one size']], 'auto'),
        n('size', 'Packet size', '1400', 'Manual mode only. Total IP packet size.'),
        s('hops', 'Show hops', [['', 'Default'], ['true', 'Yes'], ['false', 'No']], '',
          'Discover mode only.')
      ]
    },
    portconnect: {
      name: 'TCP/UDP Connect', icon: '🔌', fields: [
        t('target', 'Target', '192.168.1.50', HOST),
        n('port', 'Port', '443'),
        s('protocol', 'Protocol', [['tcp', 'TCP'], ['udp', 'UDP']], 'tcp'),
        s('udpprofile', 'UDP probe', [
          ['none', 'None'], ['dns', 'DNS'], ['ntp', 'NTP'], ['snmp', 'SNMP'],
          ['sip', 'SIP'], ['radius', 'RADIUS'], ['tftp', 'TFTP'],
          ['memcached', 'memcached']
        ], 'none', 'UDP only. Sends a real query so a silent port can be told apart from an open one.')
      ]
    },
    ntp: {
      name: 'NTP Time Check', icon: '⏰', fields: [
        t('target', 'Time server', 'time.apple.com'),
        s('samples', 'Samples', [['1', '1'], ['3', '3'], ['5', '5']], '3')
      ]
    },
    publicip: { name: 'Public IP + Geo/ASN', icon: '🌎', fields: [] },
    whois: {
      name: 'Whois', icon: '📄', fields: [
        t('target', 'Domain or IP', 'example.com'),
        s('mode', 'Protocol', [['rdap', 'RDAP'], ['whois', 'Classic WHOIS']], 'rdap')
      ]
    },
    dns: {
      name: 'DNS Lookup', icon: '🔎', fields: [
        t('target', 'Name or IP', 'example.com',
          'A hostname does a forward lookup, an IP literal does a reverse PTR lookup.'),
        t('server', 'Resolver', '1.1.1.1', 'Leave empty to use the network default.')
      ]
    },
    dnsexplorer: {
      name: 'DNS Record Explorer', icon: '📑', fields: [
        t('target', 'Name or IP', 'example.com'),
        t('server', 'Resolver', '1.1.1.1', 'Leave empty to use the network default.')
      ]
    },
    tls: {
      name: 'TLS Certificate Inspector', icon: '🔐', fields: [
        t('target', 'Host', 'example.com', 'Hostname to inspect the certificate of.')
      ]
    },
    portscan: {
      name: 'Port Scan', icon: '🔧', fields: [
        t('target', 'Target', '192.168.1.50', HOST),
        t('ports', 'Ports', '22,80,443', 'A list like 22,80,443 or a range like 1-1024.')
      ]
    },
    reachme: {
      name: 'External Port Check', icon: '📡', fields: [
        n('port', 'Port', '443',
          'A server on the internet connects back to this port on your public IP.')
      ]
    },
    lanscan: {
      name: 'LAN Scan', icon: '🖥', fields: [
        t('subnet', 'Subnet', '192.168.1.0/24', 'CIDR range to scan.'),
        s('mode', 'Mode', [['fast', 'Fast'], ['deep', 'Deep']], 'fast',
          'Deep also probes common ports, which finds devices that ignore ping.')
      ]
    },
    subnet: {
      name: 'Subnet Calculator', icon: '🧮', fields: [
        t('target', 'CIDR', '192.168.1.0/24')
      ]
    },
    bonjour: { name: 'Bonjour Browser', icon: '📶', fields: [] },
    upnp: {
      name: 'UPnP / NAT-PMP', icon: '🔁', fields: [
        t('gateways', 'Gateways', '192.168.1.1',
          'Optional. Comma separated. Leave empty to detect automatically.')
      ]
    },
    wol: {
      name: 'Wake-on-LAN', icon: '⏻', fields: [
        t('mac', 'MAC address', 'AA:BB:CC:DD:EE:FF', 'The wired adapter, not Wi-Fi.'),
        t('broadcast', 'Broadcast address', '192.168.1.255',
          'The subnet broadcast address, not the sleeping machine’s IP.'),
        n('port', 'Port', '9')
      ]
    },
    /* Not a tool. Automations use a different URL shape, with the saved
       automation's id in the path instead of a tool slug, so the builder
       special-cases it via the `automation` flag. */
    automation: {
      name: 'Saved automation', icon: '\u26A1', automation: true, fields: [
        t('slug', 'Automation ID', 'homelab-external',
          'The deeplink id assigned when the automation was created. Its run screen can copy the whole link for you.')
      ]
    }
  };

  /* Grouping for the picker. Kept beside the tools rather than inside each
     entry so the 20 specs above stay readable. Mirrors the docs sidebar. */
  var CATEGORY_OF = {
    ping: 'Connectivity', http: 'Connectivity', speed: 'Connectivity',
    iperf3: 'Connectivity', traceroute: 'Connectivity', mtu: 'Connectivity',
    portconnect: 'Connectivity', ntp: 'Connectivity', wol: 'Connectivity',
    publicip: 'Lookup & Info', whois: 'Lookup & Info', dns: 'Lookup & Info',
    dnsexplorer: 'Lookup & Info', tls: 'Lookup & Info',
    portscan: 'Scanning & Discovery', reachme: 'Scanning & Discovery',
    lanscan: 'Scanning & Discovery', subnet: 'Scanning & Discovery',
    bonjour: 'Scanning & Discovery', upnp: 'Scanning & Discovery',
    automation: 'Automation'
  };

  var CATEGORY_ORDER = ['Connectivity', 'Lookup & Info',
                        'Scanning & Discovery', 'Automation'];

  /* The three interchangeable URL forms from /docs/deeplinks.html. Only the
     picker exposes a choice; embedded widgets always emit the Universal Link,
     because that is the only form that degrades to a web page when the app is
     not installed. */
  var FORMS = [
    ['https://netdebug.app/open/', 'Universal Link (recommended for sharing)'],
    ['netdebug://', 'Custom scheme (netdebug://)'],
    ['co.developerinsider.NetDebugToolkit://', 'Bundle ID scheme']
  ];

  function sizes() {
    return [['1', '1 MB'], ['2', '2 MB'], ['8', '8 MB'], ['32', '32 MB'],
            ['64', '64 MB'], ['96', '96 MB']];
  }

  /* RFC 3986 allows ':', ',' and '/' unescaped inside a query value, and the
     deeplink reference documents them that way. Leaving them alone keeps a MAC
     address, a CIDR range, a port list and a URL readable in the preview and
     identical to the examples in the docs. Everything else, '&' and '=' in
     particular, still gets escaped. */
  function enc(v) {
    return encodeURIComponent(v)
      .replace(/%3A/g, ':')
      .replace(/%2C/g, ',')
      .replace(/%2F/g, '/');
  }

  var uid = 0;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function isApple() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function build(node) {
    if (node.classList.contains('ndt-ready')) return;

    var slug = node.getAttribute('data-tool');
    var spec = TOOLS[slug];
    // An unrecognised slug keeps its fallback link rather than rendering an
    // empty form, so a typo degrades to the behaviour we already had.
    if (!spec) return;

    var id = 'ndt' + (++uid);
    var picker = node.hasAttribute('data-picker');
    var base = node.getAttribute('data-urlform') || BASE;
    var fields = spec.fields.concat([AUTORUN, EXPORT]);
    var values = {};

    fields.forEach(function (f) {
      var pre = node.getAttribute('data-' + f.key);
      if (pre != null) {
        values[f.key] = f.type === 'checkbox' ? pre !== 'false' : pre;
      } else if (f.def !== undefined) {
        values[f.key] = f.def;
      } else {
        values[f.key] = '';
      }
    });

    function url() {
      var q = [];
      fields.forEach(function (f) {
        // An automation's id belongs in the path, not the query string.
        if (spec.automation && f.key === 'slug') return;
        var v = values[f.key];
        if (f.type === 'checkbox') {
          // autorun defaults to true in the app, so only the negative case
          // needs to travel in the URL.
          if (v === false) q.push('autorun=false');
          return;
        }
        if (v === '' || v == null) return;
        q.push(f.key + '=' + enc(v));
      });
      var path = spec.automation
        ? 'automation/' + enc(values.slug || '')
        : slug;
      return base + path + (q.length ? '?' + q.join('&') : '');
    }

    var box = el('div', 'ndt-box');

    var head = el('div', 'ndt-head');
    head.appendChild(el('span', 'ndt-icon', spec.icon));
    var titles = el('div');
    titles.appendChild(el('span', 'ndt-name',
      node.getAttribute('data-title') || ('Open ' + spec.name + ' in the app')));
    titles.appendChild(el('span', 'ndt-slug', slug));
    head.appendChild(titles);
    box.appendChild(head);

    if (picker) box.appendChild(pickerRow());

    var grid = el('div', 'ndt-grid');
    var extras = el('div', 'ndt-grid');

    function pickerRow() {
      var row = el('div', 'ndt-grid ndt-picker');

      var toolWrap = el('div', 'ndt-field');
      var toolLabel = el('label', null, 'Tool');
      toolLabel.setAttribute('for', id + '-tool');
      var toolSel = el('select');
      toolSel.id = id + '-tool';
      CATEGORY_ORDER.forEach(function (cat) {
        var group = document.createElement('optgroup');
        group.label = cat;
        Object.keys(TOOLS).forEach(function (key) {
          if (CATEGORY_OF[key] !== cat) return;
          var opt = el('option', null, TOOLS[key].name);
          opt.value = key;
          group.appendChild(opt);
        });
        if (group.childNodes.length) toolSel.appendChild(group);
      });
      toolSel.value = slug;
      toolWrap.appendChild(toolLabel);
      toolWrap.appendChild(toolSel);
      row.appendChild(toolWrap);

      var formWrap = el('div', 'ndt-field');
      var formLabel = el('label', null, 'URL form');
      formLabel.setAttribute('for', id + '-form');
      var formSel = el('select');
      formSel.id = id + '-form';
      FORMS.forEach(function (f) {
        var opt = el('option', null, f[1]);
        opt.value = f[0];
        formSel.appendChild(opt);
      });
      formSel.value = base;
      formWrap.appendChild(formLabel);
      formWrap.appendChild(formSel);
      formWrap.appendChild(el('span', 'ndt-hint',
        'All three reach the same screen. Only the Universal Link opens a web page when the app is missing.'));
      row.appendChild(formWrap);

      formSel.addEventListener('change', function () {
        base = formSel.value;
        node.setAttribute('data-urlform', base);
        refresh();
      });

      /* Changing the tool rebuilds the whole widget rather than patching the
         field list, so there is one construction path instead of two. Only
         `target` is carried across, since it is the one value that means the
         same thing for every tool that has it. */
      toolSel.addEventListener('change', function () {
        var keep = { tool: toolSel.value, picker: '', urlform: base };
        var target = node.getAttribute('data-target');
        if (target) keep.target = target;
        Array.prototype.slice.call(node.attributes).forEach(function (a) {
          if (a.name.indexOf('data-') === 0) node.removeAttribute(a.name);
        });
        Object.keys(keep).forEach(function (k) {
          node.setAttribute('data-' + k, keep[k]);
        });
        if (window.history && history.replaceState) {
          history.replaceState(null, '',
            location.pathname + '?tool=' + encodeURIComponent(toolSel.value));
        }
        node.classList.remove('ndt-ready');
        node.textContent = '';
        build(node);
      });

      return row;
    }

    fields.forEach(function (f) {
      var wrap = el('div', 'ndt-field');
      var fid = id + '-' + f.key;
      var label = el('label', null, f.label);
      label.setAttribute('for', fid);
      wrap.appendChild(label);

      var input;
      if (f.type === 'select') {
        input = el('select');
        f.options.forEach(function (o) {
          var opt = el('option', null, o[1]);
          opt.value = o[0];
          input.appendChild(opt);
        });
        input.value = values[f.key];
        if (input.value !== String(values[f.key])) {
          /* The picker carries values across tools, so a prefill can be
             meaningless for the tool now selected (lanscan's mode=fast
             landing on whois, say). Fall back rather than showing blank. */
          input.value = f.def !== undefined ? f.def : f.options[0][0];
          values[f.key] = input.value;
        }
      } else if (f.type === 'checkbox') {
        input = el('input');
        input.type = 'checkbox';
        input.checked = values[f.key] !== false;
        wrap.className = 'ndt-field ndt-check';
      } else {
        input = el('input');
        input.type = f.type === 'number' ? 'number' : 'text';
        input.value = values[f.key];
        if (f.placeholder) input.placeholder = f.placeholder;
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('autocorrect', 'off');
        input.spellcheck = false;
      }
      input.id = fid;
      input.addEventListener('input', function () {
        values[f.key] = f.type === 'checkbox' ? input.checked : input.value.trim();
        refresh();
      });
      input.addEventListener('change', function () {
        values[f.key] = f.type === 'checkbox' ? input.checked : input.value.trim();
        refresh();
      });
      wrap.appendChild(input);
      if (f.hint) wrap.appendChild(el('span', 'ndt-hint', f.hint));

      (f === AUTORUN || f === EXPORT ? extras : grid).appendChild(wrap);
    });

    if (grid.childNodes.length) box.appendChild(grid);

    var more = el('details', 'ndt-more');
    more.appendChild(el('summary', null, 'More options'));
    more.appendChild(extras);
    box.appendChild(more);

    var preview = el('code', 'ndt-url');
    var previewWrap = el('div', 'ndt-preview');
    previewWrap.appendChild(preview);
    box.appendChild(previewWrap);

    var actions = el('div', 'ndt-actions');
    var open = el('a', 'ndt-btn ndt-primary', 'Open in the app');
    open.rel = 'nofollow';
    var copy = el('button', 'ndt-btn ndt-secondary', 'Copy link');
    copy.type = 'button';

    if (isApple()) {
      actions.appendChild(open);
      actions.appendChild(copy);
    } else {
      actions.appendChild(copy);
      actions.appendChild(open);
    }
    box.appendChild(actions);

    var note = el('p', 'ndt-note');
    box.appendChild(note);

    function noteText() {
      if (base !== BASE) {
        return 'Custom scheme links open the app directly but have no web fallback, ' +
          'so they do nothing on a device without NetDebug Toolkit installed. ' +
          'Use the Universal Link when you are sharing with someone else.';
      }
      return isApple()
        ? 'Opens NetDebug Toolkit with these options filled in. Without the app installed the link explains itself and offers the App Store.'
        : 'This link opens the app on iPhone, iPad or Apple TV. Copy it and send it to a device that has NetDebug Toolkit installed.';
    }

    copy.addEventListener('click', function () {
      if (incomplete) return;
      var u = url();
      var done = function () {
        copy.textContent = 'Copied';
        setTimeout(function () { copy.textContent = 'Copy link'; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(u).then(done, function () { fallback(u, done); });
      } else {
        fallback(u, done);
      }
    });

    function fallback(text, done) {
      var ta = el('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
    }

    /* An automation's id sits in the path, so an empty one produces
       `.../automation/`, which is not a link anyone can use. Every other tool
       degrades gracefully to "open this tool with nothing filled in". */
    var incomplete = false;

    function refresh() {
      incomplete = !!spec.automation && !values.slug;
      var u = url();
      if (incomplete) {
        open.removeAttribute('href');
        open.classList.add('ndt-disabled');
        open.setAttribute('aria-disabled', 'true');
        preview.textContent = base + 'automation/<automation id>';
        note.textContent = 'Enter the automation id to finish the link. It is ' +
          'assigned when the automation is created, and the run screen can copy ' +
          'the whole link for you.';
      } else {
        open.href = u;
        open.classList.remove('ndt-disabled');
        open.removeAttribute('aria-disabled');
        preview.textContent = u;
        note.textContent = noteText();
      }
    }

    refresh();

    node.textContent = '';
    node.appendChild(box);
    node.classList.add('ndt-ready');
  }

  function init() {
    var nodes = document.querySelectorAll('.ndt-launch');
    var wanted = null;
    try {
      wanted = new URLSearchParams(location.search).get('tool');
    } catch (e) { /* older browser, ignore */ }

    for (var i = 0; i < nodes.length; i++) {
      /* Done here rather than inside build() so a ?tool= parameter seeds the
         picker once and does not fight the reader's later selections. */
      if (wanted && nodes[i].hasAttribute('data-picker') &&
          TOOLS[wanted.toLowerCase()]) {
        nodes[i].setAttribute('data-tool', wanted.toLowerCase());
      }
      build(nodes[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
