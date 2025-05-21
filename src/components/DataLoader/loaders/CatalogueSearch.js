import React, { useState, useCallback, useEffect } from 'react';
import { Form, Spinner, Alert, Button, Collapse, Row, Col, Card } from 'react-bootstrap';
import { fetchData } from './SparqlFetch'; // Import fetchData
import { Parser as SparqlParser } from 'sparqljs'; // Import SparqlParser
import { debounce } from 'lodash';
import { csvFormat } from 'd3-dsv'; // Import csvFormat
import styles from './CatalogueSearch.module.scss';
import { SparqlMarker } from '../../../hooks/useDataLoaderUtils/parser'; // Import the SparqlMarker Symbol
import { useRef } from 'react'; // Import useRef

function CatalogueSearch({ setUserInput, setLoadingError, initialState }) {
  const isMountedRef = useRef(true); // Ref to track mounted state
  const [searchTerm, setSearchTerm] = useState('');
  const [sparqlEndpoint, setSparqlEndpoint] = useState(initialState?.endpoint || 'https://fskx-api-gateway-service.risk-ai-cloud.com/gdb-proxy-service/sparql'); // Default or from initial state
  const [showEndpointInput, setShowEndpointInput] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const executeSearch = useCallback(async (currentSearchTerm, currentEndpoint, isInitialCall = false) => {
    if (!isInitialCall && !currentSearchTerm.trim()) {
      setSearchResults([]);
      setError(null);
      return;
    }
    if (!currentEndpoint.trim()) {
      setError("SPARQL endpoint URL cannot be empty.");
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    setLoadingError(null);

    const queryString = `
      PREFIX dcat: <http://www.w3.org/ns/dcat#>
      PREFIX dct: <http://purl.org/dc/terms/>

      SELECT ?dataset ?title
             (SAMPLE(?desc) AS ?description)
             (SAMPLE(?dlURL) AS ?downloadURL)
             (SAMPLE(?lic) AS ?license)
             (GROUP_CONCAT(DISTINCT STR(?kw); SEPARATOR=", ") AS ?keywords)
      WHERE {GRAPH <https://fskx-graphdb.risk-ai-cloud.com/765519e1754dfade07fdb3e80036e2c3/ontology/>{
        ?dataset a dcat:Dataset .
        ?dataset dct:title ?title .
        OPTIONAL { ?dataset dct:description ?desc . }
        OPTIONAL {
          ?dataset dcat:distribution ?distribution .
          ?distribution dcat:downloadURL ?dlURL .
        }
        OPTIONAL { ?dataset dcat:keyword ?kw . } # Corrected to dcat:keyword
        OPTIONAL { ?dataset dct:license ?lic . }

        ${currentSearchTerm.trim() ? `FILTER (regex(str(?title), "${currentSearchTerm}", "i"))` : ''}
   } }
      GROUP BY ?dataset ?title
      LIMIT 5 # Corrected LIMIT to 5
    `;

    const parser = new SparqlParser();
    try {
      const parsedQuery = parser.parse(queryString);
      const source = {
        type: 'sparql', // Matches what fetchData expects
        url: currentEndpoint,
        query: parsedQuery,
      };
      // fetchData returns already processed objects (not raw SPARQL JSON)
      const results = await fetchData(source); 
      setSearchResults(results);
      if (results.length === 0) {
        setError('No datasets found matching your query.');
      }
    } catch (e) {
      console.error("SPARQL query or parsing error:", e);
      const errorMessage = e.message || 'Failed to fetch or parse data from the SPARQL endpoint.';
      setError(errorMessage);
      setLoadingError(errorMessage);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [setLoadingError]);

  // Effect for initial data load & mounted state
  useEffect(() => {
    isMountedRef.current = true;
    if (sparqlEndpoint && !initialLoadDone) {
      executeSearch('', sparqlEndpoint, true); 
      setInitialLoadDone(true);
    }
    return () => {
      isMountedRef.current = false; // Set to false when component unmounts
    };
  }, [sparqlEndpoint, executeSearch, initialLoadDone]); // executeSearch and initialLoadDone added as dependencies

  const debouncedSearch = useCallback(debounce((term, endpoint) => executeSearch(term, endpoint, false), 500), [executeSearch]); // executeSearch is already a useCallback

  const handleSearchTermChange = (e) => {
    const newSearchTerm = e.target.value;
    setSearchTerm(newSearchTerm);
    if (newSearchTerm.trim() === '') {
      // If search term is cleared, fetch initial list
      executeSearch('', sparqlEndpoint, true);
    } else {
      debouncedSearch(newSearchTerm, sparqlEndpoint);
    }
  };

  const handleEndpointChange = (e) => {
    setSparqlEndpoint(e.target.value);
    // Optionally, trigger search immediately if there's a search term
    if (searchTerm.trim()) {
      debouncedSearch(searchTerm, e.target.value);
    }
  };
  
  const handleDatasetSelect = async (item) => {
    setLoadingError(null);
    setIsLoading(true);
    setError(null); // Clear previous errors

    // IMPORTANT: This is a placeholder query. Replace with the actual static query.
    const STATIC_DEFAULT_QUERY_STRING = `
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
     SELECT ?s ?column_name ?entity_name WHERE {
  ?s ?p ?entity_name .
  ?p rdfs:label ?column_name.
  #OPTIONAL {?o rdfs:label ?entity_name}
  FILTER REGEX(STR(?s), "http://bfr-bund-graph.de/data/f32aabcfaf804182066be20bc9d1d79a", "i")
}

    `;

    const parser = new SparqlParser();
    let parsedQuery;

    try {
      parsedQuery = parser.parse(STATIC_DEFAULT_QUERY_STRING);
    } catch (e) {
      console.error("Error parsing static default SPARQL query:", e);
      const errorMessage = `Error parsing the predefined SPARQL query: ${e.message}`;
      if (isMountedRef.current) {
        setError(errorMessage);
        setLoadingError(errorMessage);
        setIsLoading(false);
      }
      return;
    }

    const source = {
      type: 'sparql', // Will be used by fetchData
      url: sparqlEndpoint, // Use the current catalogue's SPARQL endpoint
      query: parsedQuery,
    };

    try {
      // Pivot the results: group by subject, predicates become columns
      const pivotTripleResults = (triples) => {
        if (!triples || triples.length === 0) {
          return [];
        }
        // User's query returns ?s, ?column_name, ?entity_name
        // ?s is the subject/row identifier
        // ?column_name is the predicate/column header
        // ?entity_name is the object/value
        const groupedBySubject = triples.reduce((acc, triple) => {
          const subjectVal = triple.s; 
          const predicateVal = triple.column_name; 
          const objectVal = triple.entity_name;

          if (!subjectVal || !predicateVal) {
            // Skip triples missing subject or predicate for pivoting
            console.warn('Skipping triple due to missing subject or predicate for pivoting:', triple);
            return acc;
          }

          // Initialize row with the subject variable itself, using its original name 's'
          // or a generic name like 'id' or the first column name from the query.
          // For now, let's keep 's' as a column in the output, or use a fixed name like 'identifier'.
          // The user might want the 's' column to be named something specific or omitted if it's just an IRI.
          // Let's assume 's' should be part of the output row.
          acc[subjectVal] = acc[subjectVal] || { s: subjectVal }; 
          acc[subjectVal][predicateVal] = objectVal;
          return acc;
        }, {});

        const pivoted = Object.values(groupedBySubject);
        // Preserve the SparqlMarker (Symbol) if present on the rawResults
        if (rawResults[SparqlMarker] === true) {
          pivoted[SparqlMarker] = true;
        }
        return pivoted;
      };

      const rawResults = await fetchData(source); // fetchData is already imported
      console.log('Raw SPARQL Results (JSON before IRI resolution):', JSON.stringify(rawResults, null, 2));

      // Resolve Wikidata IRIs in the 'object' part of the raw results
      const resolveWikidataIrisInRawResults = async (triples) => {
        if (!triples || triples.length === 0) return triples;

        const wikidataIrisToResolve = new Set();
        // Assuming user's query SELECT ?s ?column_name ?entity_name
        // where ?entity_name is the object to be resolved.
        for (const triple of triples) {
          const objectValue = triple.entity_name; 
          if (typeof objectValue === 'string' &&
              (objectValue.startsWith('http://www.wikidata.org/entity/Q') || 
               objectValue.startsWith('https://www.wikidata.org/entity/Q') ||
               objectValue.startsWith('http://www.wikidata.org/wiki/Q') ||    // Add /wiki/ variant
               objectValue.startsWith('https://www.wikidata.org/wiki/Q'))) { // Add /wiki/ variant
            wikidataIrisToResolve.add(objectValue);
          }
        }

        if (wikidataIrisToResolve.size === 0) {
          console.log("No Wikidata IRIs found in 'entity_name' field to resolve.");
          return triples; 
        }
        
        console.log("Attempting to resolve Wikidata IRIs:", [...wikidataIrisToResolve]);
        const labelsMap = await fetchWikidataLabels([...wikidataIrisToResolve]); // Existing helper
        console.log("Resolved Wikidata Labels Map:", labelsMap);

        const resolvedTriples = triples.map(triple => {
          const objectValue = triple.entity_name;
          if (typeof objectValue === 'string' && labelsMap.hasOwnProperty(objectValue)) {
            // Store as an object to keep both IRI and Label
            return { 
              ...triple, 
              entity_name: { 
                iri: objectValue, 
                label: labelsMap[objectValue],
                __resolved_iri__: true // Special marker for this type of object
              } 
            };
          }
          return triple;
        });

        if (triples[SparqlMarker] === true) { // Propagate marker
          resolvedTriples[SparqlMarker] = true;
        }
        return resolvedTriples;
      };

      const resultsWithResolvedIris = await resolveWikidataIrisInRawResults(rawResults);
      console.log('Results with resolved IRIs (JSON before pivoting):', JSON.stringify(resultsWithResolvedIris, null, 2));
      
      const pivotedResults = pivotTripleResults(resultsWithResolvedIris);
      console.log('Pivoted Results (JSON after resolving and pivoting):', JSON.stringify(pivotedResults, null, 2));

      if (pivotedResults && pivotedResults.length > 0) {
        try {
          const csvString = csvFormat(pivotedResults);
          console.log('Pivoted Results (CSV):\n', csvString);
        } catch (csvError) {
          console.error('Error converting pivoted results to CSV:', csvError);
        }
      } else {
        console.log('Pivoted Results (CSV): No data to format.');
      }

      setUserInput(pivotedResults, {
        type: 'sparql',
        query: parsedQuery, 
        endpoint: sparqlEndpoint, 
        fromCatalogueClick: true, 
        originalItemTitle: item.title, 
        staticQueryUsed: STATIC_DEFAULT_QUERY_STRING, 
      });
    } catch (e) {
      console.error("Error during dataset selection and processing:", e);
      const errorMessage = e.message || `Failed to execute the predefined SPARQL query on endpoint ${sparqlEndpoint}.`;
      if (isMountedRef.current) {
        setError(errorMessage);
        setLoadingError(errorMessage);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

// Helper function to fetch labels from Wikidata (remains largely the same)
async function fetchWikidataLabels(iris) {
  if (!iris || iris.length === 0) return {};
  const ids = iris.map(iri => iri.substring(iri.lastIndexOf('/') + 1)).join('|');
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=labels&languages=en&format=json&origin=*`;
  const labels = {};
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Wikidata API error: ${response.status} ${response.statusText}`);
      return labels;
    }
    const data = await response.json();
    if (data.entities) {
      for (const idKey in data.entities) {
        const entity = data.entities[idKey];
        // Check if entity and its ID exists, and it has an English label
        if (entity && entity.id && entity.labels && entity.labels.en && entity.labels.en.value) {
          const originalIri = iris.find(iri => iri.endsWith('/' + entity.id));
          if (originalIri) {
            labels[originalIri] = entity.labels.en.value;
          }
        } else {
          // If no English label, try to find the original IRI and keep it, or mark as 'Label not found'
          const originalIri = iris.find(iri => iri.endsWith('/' + (entity.id || idKey)));
          if (originalIri && !labels[originalIri]) { // Avoid overwriting if somehow already set
             // labels[originalIri] = originalIri; // Keep original IRI if no label
             console.warn(`No English label found for Wikidata entity: ${originalIri} (ID: ${entity.id || idKey})`);
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to fetch or parse Wikidata labels:", error);
  }
  return labels;
}

// Removed fetchNcbiProteinLabels as per user request to focus on Wikidata

  return (
    <div>
      <Button
        onClick={() => setShowEndpointInput(!showEndpointInput)}
        aria-controls="sparql-endpoint-collapse"
        aria-expanded={showEndpointInput}
        variant="link"
        className="p-0 mb-2"
      >
        {showEndpointInput ? 'Hide SPARQL Endpoint' : 'Change SPARQL Endpoint'}
      </Button>
      <Collapse in={showEndpointInput}>
        <div id="sparql-endpoint-collapse">
          <Form.Group controlId="sparqlEndpoint" className="mb-2">
            <Form.Label>SPARQL Endpoint URL</Form.Label>
            <Form.Control
              type="url"
              placeholder="Enter SPARQL endpoint URL"
              value={sparqlEndpoint}
              onChange={handleEndpointChange}
            />
          </Form.Group>
        </div>
      </Collapse>

      <Form.Group controlId="searchTerm">
        <Form.Label>Search Dataset</Form.Label>
        <Form.Control
          type="text"
          placeholder="Enter search term for dataset title or description"
          value={searchTerm}
          onChange={handleSearchTermChange}
          disabled={!sparqlEndpoint.trim()}
        />
      </Form.Group>

      {isLoading && (
        <div className="d-flex align-items-center mt-3">
          <Spinner animation="border" size="sm" role="status" className="me-2" />
          <span>Searching catalogue...</span>
        </div>
      )}

      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

      {!isLoading && searchResults.length > 0 && (
        <Row className="mt-3"> {/* Removed g-3 as Col will be full width */}
          {searchResults.map((item, index) => (
            <Col xs={12} key={item.dataset + index} className="mb-3"> {/* Full width, mb-3 for spacing */}
              <Card
                className={`${styles.datasetItemCard} w-100`}
                onClick={() => handleDatasetSelect(item)}
              >
                <Card.Body className={styles.cardBody}>
                  <h5 className={styles.cardTitle}>
                    {item.title || '[No Title Provided]'}
                  </h5>
                  <p className={styles.cardText}>
                    {item.description || 'No description available.'}
                  </p>
                  <div className={styles.metadataSection}>
                    {item.keywords && (
                      <div className={styles.metadataItem}>
                        <span className={styles.metadataLabel}>Keywords: </span>
                        <span className={styles.keywords}>{item.keywords}</span>
                      </div>
                    )}
                    {item.license && (
                      <div className={styles.metadataItem}>
                        <span className={styles.metadataLabel}>License: </span>
                        {typeof item.license === 'string' && item.license.startsWith('http') ?
                          <a href={item.license} target="_blank" rel="noopener noreferrer" className={styles.licenseLink} onClick={(e) => e.stopPropagation()}>{item.license}</a> :
                          <span>{item.license}</span>}
                      </div>
                    )}
                  </div>
                  <div className={styles.downloadStatus}>
                    {item.downloadURL && <small className="text-primary">Download available</small>}
                    {!item.downloadURL && <small className="text-warning">No direct download URL</small>}
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}

export default React.memo(CatalogueSearch);
