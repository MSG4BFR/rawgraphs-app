import React, { useState, useCallback } from 'react';
import { Form, ListGroup, Spinner, Alert, Button, Collapse } from 'react-bootstrap';
import { fetchData } from './SparqlFetch'; // Import fetchData
import { Parser as SparqlParser } from 'sparqljs'; // Import SparqlParser
import { debounce } from 'lodash';

// Basic styles (can be moved to a .module.scss file later)
const styles = {
  resultsContainer: {
    maxHeight: '300px',
    overflowY: 'auto',
    marginTop: '1rem',
    border: '1px solid #ccc',
    borderRadius: '4px',
  },
  listItem: {
    cursor: 'pointer',
  },
  listItemHover: {
    backgroundColor: '#f0f0f0',
  }
};

function CatalogueSearch({ setUserInput, setLoadingError, initialState }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sparqlEndpoint, setSparqlEndpoint] = useState(initialState?.endpoint || 'https://fskx-api-gateway-service.risk-ai-cloud.com/gdb-proxy-service/sparql'); // Default or from initial state
  const [showEndpointInput, setShowEndpointInput] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const executeSearch = useCallback(async (currentSearchTerm, currentEndpoint) => {
    if (!currentSearchTerm.trim() || !currentEndpoint.trim()) {
      setSearchResults([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setLoadingError(null);

    const queryString = `
      PREFIX dcat: <http://www.w3.org/ns/dcat#>
      PREFIX dct: <http://purl.org/dc/terms/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

      SELECT ?dataset ?title ?description ?downloadURL
      WHERE {
        ?dataset a dcat:Dataset .
        ?dataset dct:title ?title .
        OPTIONAL { ?dataset dct:description ?description . }
        OPTIONAL { 
          ?dataset dcat:distribution ?distribution .
          ?distribution dcat:downloadURL ?downloadURL .
        }

        FILTER (
          regex(str(?title), "${currentSearchTerm}", "i")# ||
         # regex(str(?description), "${currentSearchTerm}", "i")
        )
      }
      LIMIT 20
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

  const debouncedSearch = useCallback(debounce(executeSearch, 500), [executeSearch]);

  const handleSearchTermChange = (e) => {
    const newSearchTerm = e.target.value;
    setSearchTerm(newSearchTerm);
    debouncedSearch(newSearchTerm, sparqlEndpoint);
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
        <div style={styles.resultsContainer}>
          <ListGroup variant="flush">
            {searchResults.map((item, index) => (
              <ListGroup.Item
                key={item.dataset + index} // item.dataset is already the value
                action
                onClick={() => handleDatasetSelect(item)} // item is now an object from fetchData
                style={styles.listItem}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = styles.listItemHover.backgroundColor}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ''}
              >
                <div className="fw-bold">{item.title || '[No Title Provided]'}</div>
                <small className="text-muted d-block">{item.description || 'No description available.'}</small>
                {item.downloadURL && <small className="text-primary d-block">Download available</small>}
                {!item.downloadURL && <small className="text-warning d-block">No direct download URL</small>}
              </ListGroup.Item>
            ))}
          </ListGroup>
        </div>
      )}
    </div>
  );
}

export default React.memo(CatalogueSearch);
