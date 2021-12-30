const peer = "http://localhost:26657";

const errorId = "error";
const postId = "posts";
const succcessId = "success";

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Util Functions*/
function hexToBytes(hex) {
  for (var bytes = [], c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
  return new Uint8Array(bytes);
}
function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf));
}
function ab2hex(buf) {
  return [...new Uint8Array(buf)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
function uuid() {
  const uint32 = crypto.getRandomValues(new Uint32Array(1))[0];
  return uint32.toString(16);
}
function generateKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-384",
    },
    true,
    ["sign", "verify"]
  );
}
async function cryptoKey2String(priv, pub) {
  const exportedPub = await crypto.subtle.exportKey("spki", pub);
  const exportedPriv = await crypto.subtle.exportKey("pkcs8", priv);

  return [ab2hex(exportedPriv), ab2hex(exportedPub)];
}

async function fetchAllPosts() {
  const perPage = 30;

  let ret = await (
    await fetch(
      `${peer}/tx_search?` +
        new URLSearchParams({
          query: "\"post.success='true'\"",
          per_page: perPage,
        })
    )
  ).json();

  const totalPages = Math.ceil(ret?.result?.total_count / perPage);

  const posts = [];

  for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
    console.log("Fetching page", currentPage);
    ret = await (
      await fetch(
        `${peer}/tx_search?` +
          new URLSearchParams({
            query: "\"post.success='true'\"",
            page: currentPage,
            per_page: perPage,
          })
      )
    ).json();

    posts.push(
      ...ret?.result?.txs?.map(({ tx: tx64 }) => {
        const tx = atob(tx64);
        const [id, jsonString] = tx.split("=");
        const msg = JSON.parse(jsonString);
        return msg;
      })
    );
  }

  return posts;
}

async function addPost(formId) {
  try {
    const form = new FormData(document.getElementById(formId));
    const privHexString = form.get("private-key");
    const post = form.get("add-post");

    const algo = {
      name: "ECDSA",
      namedCurve: "P-384",
    };

    const _priv = await crypto.subtle.importKey(
      "pkcs8",
      hexToBytes(privHexString),
      algo,
      true,
      ["sign"]
    );
    const jwk = await crypto.subtle.exportKey("jwk", _priv);
    delete jwk.d;
    jwk.key_ops = ["verify"];

    const pub = await crypto.subtle.importKey("jwk", jwk, algo, true, [
      "verify",
    ]);
    const _pub = await crypto.subtle.exportKey("spki", pub);

    const _sign = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      _priv,
      enc.encode(post)
    );

    const url =
      `${peer}/broadcast_tx_sync?tx=` +
      `"${uuid()}=${JSON.stringify({
        publicKey: ab2hex(_pub),
        signature: ab2hex(_sign),
        msg: post,
      }).replace(/\"/g, '\\"')}"`;

    const resp = await fetch(url);

    if (!resp.ok) throw new Error("Couldn't broadcasting transaction");

    const rpc = await resp.json();
    if (!rpc || rpc.result?.code != 0) throw new Error("Transaction rejected");

    document.getElementById(succcessId).innerText =
      "📢 Transaction broadcasted successfully. Wait for the transaction to be confirmed, refresh the page after a few seconds.";
  } catch (err) {
    const errBox = document.getElementById(errorId);
    errBox.innerText = err.stack;
  }
}

/** Render Functions */
function renderPosts(posts, id) {
  const ul = document.getElementById(id);

  ul.innerHTML = posts
    .map(
      ({ msg, publicKey }) => `
      <li style="padding-bottom: 3rem; border-top: 1px dotted #80808094;">
        <p>${msg}</p>
        <div style="display: flex; align-items: center;">
          <span style="white-space: nowrap;">Author's Public Key:&nbsp&nbsp</span>
          <pre style="overflow: scroll; display:inline-block; margin: 0;">${publicKey}</pre>
        </div>
      </li>
    `
    )
    .join("");
}

async function renderKeys(id) {
  const { privateKey, publicKey } = await generateKeyPair();
  const [priv, pub] = await cryptoKey2String(privateKey, publicKey);

  const elm = document.getElementById(id);
  elm.innerText = `ECDSA Keys for curve P-384; Exported as hex strings.

  Private Key (pkcs8): 
  ${priv}

  Public Key (spki):
  ${pub}
  `;
}

(async () => {
  const posts = await fetchAllPosts();
  console.log("Fetched Posts", posts);
  renderPosts(posts, postId);

  // const _priv = hexToBytes(
  //   "3081b6020100301006072a8648ce3d020106052b8104002204819e30819b02010104302a0131d13b906af21afa4f220368276fa508802e413269e5ce53f08c8ec7e857456471624bbabf4ea85f7e8d47661556a164036200040b80a84bcf25ee5d415425160d4c5f3a3a056c1c95933fd5b277f8986f7660e1e5a25a53f0a402cb1890dfbe7182b5f16b2aa48e8581fdac6532cba3c35e795204aec9e0776d6042b4fdc7d7f7d44f6619612037acee731e21dd3df65130ea66"
  // );
  // const _pub = hexToBytes(
  //   "3076301006072a8648ce3d020106052b8104002203620004629d52c2bedabbac9f2663a9e85fef37c29748645d622d5538cb6d9eb374db6836c2124b965e2cfb8707bc95f7803e83738afd090e61da79060760c0f7ed08b2d999dfc5db01599c7d4e888e01643354808e02996fc0a770215a15ca832f458d"
  // );
  // let sign = hexToBytes(
  //   "3065023054aeb5083aba468d0287be67c09abc6bfcb3569ce12746520f1e9b2dc9cef69dae0f38896ed9f6b9a614d791cdebf49d0231009f0a448c323f60f6f601a0ee0b1ba7e6a349a321cd93ca585a923b5c1f3acf072a7f5be0c2f1f2e394d12e7eeb43f4d2"
  // );
  // const msg = enc.encode("some data to sign");

  // const algo = { name: "ECDSA", namedCurve: "P-384" };
  // let priv = await crypto.subtle.importKey("pkcs8", _priv, algo, true, [
  //   "sign",
  // ]);
  // let pub = await crypto.subtle.importKey("spki", _pub, algo, true, [
  //   "verify",
  // ]);
  // let { privateKey: priv, publicKey: pub } = await crypto.subtle.generateKey(
  //   {
  //     name: "ECDSA",
  //     namedCurve: "P-384",
  //   },
  //   true,
  //   ["sign", "verify"]
  // );
  // const exportedPub = await crypto.subtle.exportKey("spki", pub);
  // const exportedPriv = await crypto.subtle.exportKey("pkcs8", priv);

  // console.log("Private Key", ab2hex(exportedPriv));
  // console.log("Public Key", ab2hex(exportedPub));

  // const signAlgo = { name: "ECDSA", hash: "SHA-256" };
  // sign = await crypto.subtle.sign(signAlgo, priv, msg);
  // console.log("Signature", ab2hex(sign));

  // let signValid = await window.crypto.subtle.verify(signAlgo, pub, sign, msg);

  // console.log(signValid);
})();
