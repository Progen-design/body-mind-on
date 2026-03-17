# Autonomní trenér s web search

## Co je implementováno

Trainer a coach mají **autonomní přístup k internetu** přes OpenAI Web Search. Když je zapnutý, model může:

- vyhledat aktuální informace o výživě, suplementaci, tréninkových trendech
- ověřit doporučení pro daný diet_type (vegetarian, vegan)
- čerpat z nových studií nebo doporučení

Výstup zůstává **platný JSON** podle struktury plánu – web search slouží jako podpora, ne jako náhrada struktury.

## Zapnutí

V `.env` nebo Vercel Environment Variables přidej:

```
OPENAI_WEB_SEARCH_ENABLED=true
```

Bez této proměnné (nebo s jinou hodnotou) trenér běží jako dosud – jen s training daty a supporting_documents v contextu.

## Chování

| OPENAI_WEB_SEARCH_ENABLED | Trenér | Coach |
|---------------------------|--------|-------|
| `true` | Web search zapnutý | Web search zapnutý |
| `false` nebo nepřítomné | Bez web search | Bez web search |

- **Cache:** Při zapnutém web search se **neukládá cache** – každý request může vyhledat jiné výsledky.
- **Náklady:** Web search má vlastní cenu (tool call) – viz [OpenAI pricing](https://platform.openai.com/api/docs/pricing#built-in-tools).
- **Response:** Text se bere z poslední message v output, včetně případů, kdy model použil web search.

## Technické detaily

- **API:** OpenAI Responses API s `tools: [{ type: 'web_search' }]`
- **Modely:** gpt-4.1, gpt-4.1-mini (dle agentPromptsForSync)
- **Omezení:** Web search má context window 128k (viz [OpenAI docs](https://platform.openai.com/docs/guides/tools-web-search))

## Testování

1. Nastav `OPENAI_WEB_SEARCH_ENABLED=true`
2. Proveď novou registraci nebo retry initial plan
3. V `ai_logs` nebo diagnostice zkontroluj `web_search_enabled: true`
