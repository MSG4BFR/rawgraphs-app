import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import classNames from 'classnames'
import S from './SparqlFetch.module.scss'
import { sparqlExamples } from './SPARQLItems'
import { html, render } from 'lit-html'
// Removed: import SimpleClient from 'sparql-http-client/SimpleClient'
import { Generator } from 'sparqljs'
import '@rdfjs-elements/sparql-editor/sparql-editor.js'
import { SparqlMarker } from '../../../hooks/useDataLoaderUtils/parser'

const DEFAULT_PREFIXES = {
  wd: 'http://www.wikidata.org/entity/',
  wds: 'http://www.wikidata.org/entity/statement/',
  wdv: 'http://www.wikidata.org/value/',
  wdt: 'http://www.wikidata.org/prop/direct/',
  wikibase: 'http://wikiba.se/ontology#',
  p: 'http://www.wikidata.org/prop/',
  ps: 'http://www.wikidata.org/prop/statement/',
  pq: 'http://www.wikidata.org/prop/qualifier/',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  bd: 'http://www.bigdata.com/rdf#',
  wdref: 'http://www.wikidata.org/reference/',
  psv: 'http://www.wikidata.org/prop/statement/value/',
  psn: 'http://www.wikidata.org/prop/statement/value-normalized/',
  pqv: 'http://www.wikidata.org/prop/qualifier/value/',
  pqn: 'http://www.wikidata.org/prop/qualifier/value-normalized/',
  pr: 'http://www.wikidata.org/prop/reference/',
  prv: 'http://www.wikidata.org/prop/reference/value/',
  prn: 'http://www.wikidata.org/prop/reference/value-normalized/',
  wdno: 'http://www.wikidata.org/prop/novalue/',
  wdata: 'http://www.wikidata.org/wiki/Special:EntityData/',
  schema: 'http://schema.org/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  owl: 'http://www.w3.org/2002/07/owl#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  prov: 'http://www.w3.org/ns/prov#',
  bds: 'http://www.bigdata.com/rdf/search#',
  gas: 'http://www.bigdata.com/rdf/gas#',
  hint: 'http://www.bigdata.com/queryHints#',
}

// Helper function to convert SPARQL JSON results to flat objects
function convertSparqlJsonToObjects(sparqlJson) {
  if (!sparqlJson || !sparqlJson.head || !sparqlJson.results || !sparqlJson.results.bindings) {
    console.error("Invalid SPARQL JSON structure received", sparqlJson);
    return [];
  }
  const varNames = sparqlJson.head.vars;
  const bindings = sparqlJson.results.bindings;
  const result = [];

  for (const binding of bindings) {
    const row = {};
    for (const variable of varNames) {
      const term = binding[variable];
      if (!term) {
        row[variable] = '';
      } else {
        row[variable] = term.value;
      }
    }
    result.push(row);
  }
  return result;
}

export async function fetchData(source) {
  const sparqlGenerator = new Generator()
  const queryString = sparqlGenerator.stringify(source.query)
  const bearerToken = process.env.REACT_APP_SPARQL_BEARER_TOKEN;

  try {
    const response = await fetch(source.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'text/plain', 
        'Accept': 'application/sparql-results+json', // Prioritize JSON
      },
      body: queryString,
    })

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `SPARQL query failed with status ${response.status}: ${errorText}`
      );
    }

    let rows;

    // Since we are now explicitly asking for JSON, we expect JSON.
    // The server should honor the Accept header or error out if it cannot.
    // We can simplify the client-side content type checking for now.
    const jsonData = await response.json();
    rows = convertSparqlJsonToObjects(jsonData);
    
    if (rows) { // Ensure rows is not undefined
        rows[SparqlMarker] = true; 
    } else {
        rows = []; // Default to empty array if parsing failed or no data
        rows[SparqlMarker] = true;
    }
    return rows;

  } catch (error) {
    console.error('Error fetching SPARQL data:', error);
    throw error // Re-throw to be caught by the caller
  }
}

export default function SparqlFetch({
  userInput,
  setUserInput,
  setLoadingError,
  initialState,
}) {
  const [url, setUrl] = useState(initialState?.url ?? 'https://fskx-api-gateway-service.risk-ai-cloud.com/gdb-proxy-service/sparql') // Updated default URL
  const [parsedQuery, setParsedQuery] = useState(null)
  const [selectedQuery, setSelectedQuery] = useState(initialState?.query ? new Generator().stringify(initialState.query) : sparqlExamples[0].query);


  const editorDomRef = useRef()

  // Removed initialQuery memo as selectedQuery now handles the initial state and updates
  const onQueryParsed = useCallback((evt) => {
    const { query } = evt.detail
    if (query.queryType === 'SELECT') {
      setParsedQuery(query)
    } else {
      setParsedQuery(null)
    }
  }, [])

  const onParserFailure = useCallback(() => {
    console.log('parser failed')
    setParsedQuery(null)
  }, [])

  const onSubmit = useCallback(() => {
    const source = {
      type: 'sparql',
      url,
      query: parsedQuery,
    }
    fetchData(source)
      .then((result) => {
        setUserInput(result, {
          type: 'sparql',
          url,
          query: parsedQuery,
        })
      })
      .catch((err) => {
        setLoadingError(
          'It was not possible to execute the query on the given endpoint'
        )
      })
  }, [parsedQuery, setLoadingError, setUserInput, url])

  useEffect(() => {
    const node = editorDomRef.current
    render(
      html`<sparql-editor
        auto-parse
        value=${selectedQuery}
        customPrefixes=${JSON.stringify(DEFAULT_PREFIXES)}
        @parsed=${onQueryParsed}
        @parsing-failed=${onParserFailure}
      ></sparql-editor>`,
      node
    )
  }, [onQueryParsed, onParserFailure, selectedQuery])

  const handleExampleChange = (event) => {
    const newQuery = event.target.value;
    setSelectedQuery(newQuery);
    // The sparql-editor should update automatically due to the `value` prop changing in its render.
  };

  return (
    <>
      <div className={classNames(S['base-iri-input-here'])}>
        <span>Write your SPARQL Endpoint here</span>
      </div>
      <input
        className={classNames('w-100', S['url-input'])}
        value={url}
        onChange={(e) => {
          setUrl(e.target.value)
        }}  contenteditable="true"
      />
      <div className={classNames(S['query-input-here'], 'mt-3 mb-2 d-flex justify-content-between align-items-center')}>
        <span>Write your query here</span>
        <select
          className={classNames('form-select form-select-sm', S['example-select'])}
          onChange={handleExampleChange}
          value={selectedQuery} // Ensure the select shows the current query if it matches an example
        >
          {sparqlExamples.map((example) => (
            <option key={example.title} value={example.query}>
              {example.title}
            </option>
          ))}
        </select>
      </div>
      <div ref={editorDomRef} />
      <div className="text-right">
        <button
          className="btn btn-sm btn-success mt-3"
          disabled={!parsedQuery || !url}
          onClick={onSubmit}
        >
          Run query
        </button>
      </div>
    </>
  )
}

// Removed bindingsToJson as it's no longer used for CSV parsing
