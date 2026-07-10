import Java from "frida-java-bridge";

Java.perform(() => {
  const MethodManager = Java.use("it.wiz.camst.utils.MethodManager");
  const md5 = MethodManager.md5.overload("java.lang.String");

  md5.implementation = function (value: Java.Wrapper) {
    const text = value === null ? "<null>" : value.toString();
    send({ kind: "md5-input", length: text.length, value: text });
    return md5.call(this, value);
  };

  send({ kind: "ready", message: "Hook MethodManager.md5 attivo" });
});
