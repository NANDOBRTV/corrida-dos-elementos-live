import {runSelfTests} from "../src/selftest.js";
const results=runSelfTests();
const summary=document.getElementById("testSummary"),container=document.getElementById("testResults");
const passed=results.filter(r=>r.ok).length;
summary.textContent=passed+" de "+results.length+" testes aprovados.";
summary.style.color=passed===results.length?"#c8ff8b":"#ffaea4";
for(const result of results) {
 const row=document.createElement("div");row.className="test-row";
 const title=document.createElement("span");title.textContent=result.name;
 const status=document.createElement("strong");status.className=result.ok?"test-pass":"test-fail";status.textContent=result.ok?"APROVADO":"FALHOU";
 row.append(title,status);container.append(row);
 if(result.error){const details=document.createElement("p");details.className="test-details";details.textContent=result.error;container.append(details);}
}