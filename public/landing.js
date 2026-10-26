const p = new URLSearchParams(location.search);
const rows = ["utm_source", "utm_medium", "utm_campaign"].map((k) => {
  const tr = document.createElement("tr");
  const th = Object.assign(document.createElement("th"), { scope: "row", textContent: k });
  const td = document.createElement("td");
  td.append(Object.assign(document.createElement("code"), { textContent: p.get(k) || "(none: you came here directly)" }));
  tr.append(th, td);
  return tr;
});
document.getElementById("utm").replaceChildren(...rows);
