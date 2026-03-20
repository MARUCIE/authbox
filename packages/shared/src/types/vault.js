// Vault item types - these represent the plaintext data BEFORE encryption
// The server only ever sees encrypted blobs
export var ItemType;
(function (ItemType) {
    ItemType["Login"] = "login";
    ItemType["ApiKey"] = "api_key";
    ItemType["SecureNote"] = "secure_note";
    ItemType["Identity"] = "identity";
    ItemType["Card"] = "card";
})(ItemType || (ItemType = {}));
//# sourceMappingURL=vault.js.map