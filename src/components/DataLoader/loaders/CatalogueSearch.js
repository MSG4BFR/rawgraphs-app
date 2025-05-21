import React, { useState, useCallback, useEffect } from 'react';
import { Form, Spinner, Alert, Button, Collapse, Row, Col, Card } from 'react-bootstrap';
import { fetchData } from './SparqlFetch'; // Import fetchData
import { Parser as SparqlParser } from 'sparqljs'; // Import SparqlParser
import { debounce } from 'lodash';
import styles from './CatalogueSearch.module.scss';

function CatalogueSearch({ setUserInput, setLoadingError, initialState }) {
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
        OPTIONAL { ?dataset dcat:keywords ?kw . } # Corrected to dcat:keyword
        OPTIONAL { ?dataset dct:license ?lic . }

        ${currentSearchTerm.trim() ? `FILTER (regex(str(?title), "${currentSearchTerm}", "i"))` : ''}
         }
        }
      GROUP BY ?dataset ?title
      LIMIT 10 # Corrected LIMIT
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

  // Effect for initial data load
  useEffect(() => {
    if (sparqlEndpoint && !initialLoadDone) {
      executeSearch('', sparqlEndpoint, true); // Empty search term for initial load, isInitialCall = true
      setInitialLoadDone(true);
    }
  }, [sparqlEndpoint, executeSearch, initialLoadDone]);

  const debouncedSearch = useCallback(debounce((term, endpoint) => executeSearch(term, endpoint, false), 500), [executeSearch]);

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
    // item is an object like { dataset: "uri", title: "title", description: "desc", downloadURL: "url" }
    // from the results of fetchData
    setLoadingError(null);
    setIsLoading(true);

    if (item.downloadURL) {
      try {
        // Use the downloadURL to fetch the actual data
        // This mimics how UrlFetch or other loaders might work.
        // We assume the downloadURL points to a CSV/TSV/JSON file.
        const response = await fetch(item.downloadURL);
        if (!response.ok) {
          throw new Error(`Failed to download data from ${item.downloadURL}: ${response.statusText}`);
        }
        const rawData = await response.text();
        // setUserInput expects the raw data string and a source object
        setUserInput(rawData, { 
          type: 'catalogue-url', // Indicate data came from catalogue via URL
          url: item.downloadURL, 
          title: item.title,
          originalEndpoint: sparqlEndpoint,
          originalSearchTerm: searchTerm,
          selectedDatasetUri: item.dataset
        });
      } catch (e) {
        console.error("Error fetching dataset from downloadURL:", e);
        const errorMessage = e.message || `Failed to load data for "${item.title}".`;
        setError(errorMessage);
        setLoadingError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    } else {
      // If no downloadURL, we can't directly load the data.
      // For now, we'll just set an error.
      // Alternatively, could pass the structured metadata itself if RAWGraphs can handle it.
      const errorMessage = `Dataset "${item.title}" has no direct download URL (dcat:downloadURL) specified in the catalogue.`;
      setError(errorMessage);
      setLoadingError(errorMessage);
      setIsLoading(false);
      // Or, pass the metadata if that's a desired fallback:
      // const dataToLoad = JSON.stringify([item], null, 2);
      // setUserInput(dataToLoad, { type: 'catalogue-metadata', endpoint: sparqlEndpoint, query: searchTerm, selectedDataset: item.dataset });
    }
  };

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
