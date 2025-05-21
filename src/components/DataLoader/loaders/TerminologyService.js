import React, { useState, useCallback } from 'react';
import { Form, ListGroup, Spinner, Alert, Button, Collapse } from 'react-bootstrap';
import { fetchData } from './SparqlFetch'; // Reusing the same fetchData
import { Parser as SparqlParser } from 'sparqljs';
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

function TerminologyService({ setUserInput, setLoadingError, initialState }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sparqlEndpoint, setSparqlEndpoint] = useState(initialState?.endpoint || 'https://fskx-api-gateway-service.risk-ai-cloud.com/gdb-proxy-service/sparql');
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
      PREFIX owl: <http://www.w3.org/2002/07/owl#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT DISTINCT ?term ?displayLabel ?displayComment ?termTypeIRI ?termTypeLabel
      WHERE {
        {
          ?term a owl:Class .
          BIND(owl:Class AS ?termTypeIRI)
          BIND("Class" AS ?termTypeLabel_str)
        }
        UNION
        {
          ?term a rdf:Property .
          BIND(rdf:Property AS ?termTypeIRI)
          BIND("Property" AS ?termTypeLabel_str)
        }
        UNION
        {
          ?term a owl:ObjectProperty .
          BIND(owl:ObjectProperty AS ?termTypeIRI)
          BIND("Object Property" AS ?termTypeLabel_str)
        }
        UNION
        {
          ?term a owl:DatatypeProperty .
          BIND(owl:DatatypeProperty AS ?termTypeIRI)
          BIND("Datatype Property" AS ?termTypeLabel_str)
        }
        UNION
        {
          ?term a owl:AnnotationProperty .
          BIND(owl:AnnotationProperty AS ?termTypeIRI)
          BIND("Annotation Property" AS ?termTypeLabel_str)
        }
        UNION
        {
          ?term a owl:NamedIndividual .
          BIND(owl:NamedIndividual AS ?termTypeIRI)
          BIND("Individual" AS ?termTypeLabel_str)
        }

        OPTIONAL { ?term rdfs:label ?rdfsLabel . FILTER(LANGMATCHES(LANG(?rdfsLabel), "en") || LANG(?rdfsLabel) = "") }
        OPTIONAL { ?term skos:prefLabel ?skosPrefLabel . FILTER(LANGMATCHES(LANG(?skosPrefLabel), "en") || LANG(?skosPrefLabel) = "") }
        OPTIONAL { ?term rdfs:comment ?rdfsComment . FILTER(LANGMATCHES(LANG(?rdfsComment), "en") || LANG(?rdfsComment) = "") }
        OPTIONAL { ?term skos:definition ?skosDefinition . FILTER(LANGMATCHES(LANG(?skosDefinition), "en") || LANG(?skosDefinition) = "") }
        OPTIONAL { ?term skos:altLabel ?skosAltLabel . FILTER(LANGMATCHES(LANG(?skosAltLabel), "en") || LANG(?skosAltLabel) = "") }
        OPTIONAL { ?term dcterms:title ?dctTitle . FILTER(LANGMATCHES(LANG(?dctTitle), "en") || LANG(?dctTitle) = "") }
        OPTIONAL { ?term dcterms:description ?dctDescription . FILTER(LANGMATCHES(LANG(?dctDescription), "en") || LANG(?dctDescription) = "") }


        BIND(COALESCE(?rdfsLabel, ?skosPrefLabel, ?dctTitle, "") AS ?label_intermediate)
        BIND(COALESCE(?rdfsComment, ?skosDefinition, ?dctDescription, "") AS ?comment_intermediate)

        # Create a display label, falling back to local name or full URI
        BIND(IF(STRLEN(?label_intermediate) > 0, ?label_intermediate, 
            IF(CONTAINS(STR(?term), "#"), STRAFTER(STR(?term), "#"), 
            REPLACE(STR(?term), "^.*/([^/]*)$", "$1")))
        AS ?displayLabel_computed)
        
        BIND(COALESCE(?displayLabel_computed, STR(?term)) as ?displayLabel)
        BIND(COALESCE(?comment_intermediate, "") as ?displayComment)
        BIND(COALESCE(?termTypeLabel_str, "Resource") AS ?termTypeLabel)

        FILTER (
          regex(str(?displayLabel), "${currentSearchTerm}", "i") ||
          regex(str(?displayComment), "${currentSearchTerm}", "i") ||
          regex(str(?skosAltLabel), "${currentSearchTerm}", "i") ||
          regex(STR(?term), "${currentSearchTerm}", "i") 
        )
      }
      LIMIT 20
    `;

    const parser = new SparqlParser({ sparqlStar: true }); // Enable SPARQL* if needed, though not strictly for this query
    try {
      const parsedQuery = parser.parse(queryString);
      const source = {
        type: 'sparql',
        url: currentEndpoint,
        query: parsedQuery,
      };
      const results = await fetchData(source); // fetchData returns processed objects
      setSearchResults(results);
      if (results.length === 0) {
        setError('No terms found matching your query.');
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
    if (searchTerm.trim()) {
      debouncedSearch(searchTerm, e.target.value);
    }
  };
  
  const handleTermSelect = (item) => {
    setLoadingError(null);
    // item is an object like { term: "uri", displayLabel: "label", displayComment: "comment", termTypeLabel: "Class" }
    const termData = {
      uri: item.term,
      label: item.displayLabel,
      type: item.termTypeLabel,
      typeIRI: item.termTypeIRI,
      comment: item.displayComment,
    };
    // Pass a stringified array containing the single term object
    setUserInput(JSON.stringify([termData], null, 2), { 
      type: 'terminology-item',
      termUri: item.term,
      originalEndpoint: sparqlEndpoint,
      originalSearchTerm: searchTerm,
    });
  };

  return (
    <div>
      <Button
        onClick={() => setShowEndpointInput(!showEndpointInput)}
        aria-controls="sparql-endpoint-collapse-terminology"
        aria-expanded={showEndpointInput}
        variant="link"
        className="p-0 mb-2"
      >
        {showEndpointInput ? 'Hide SPARQL Endpoint' : 'Change SPARQL Endpoint'}
      </Button>
      <Collapse in={showEndpointInput}>
        <div id="sparql-endpoint-collapse-terminology">
          <Form.Group controlId="sparqlEndpointTerminology" className="mb-2">
            <Form.Label>SPARQL Endpoint URL</Form.Label>
            <Form.Control
              type="url"
              placeholder="Enter SPARQL endpoint URL for terminology"
              value={sparqlEndpoint}
              onChange={handleEndpointChange}
            />
          </Form.Group>
        </div>
      </Collapse>

      <Form.Group controlId="searchTermTerminology">
        <Form.Label>Search Terminology</Form.Label>
        <Form.Control
          type="text"
          placeholder="Enter term (e.g., class, property, or individual name)"
          value={searchTerm}
          onChange={handleSearchTermChange}
          disabled={!sparqlEndpoint.trim()}
        />
      </Form.Group>

      {isLoading && (
        <div className="d-flex align-items-center mt-3">
          <Spinner animation="border" size="sm" role="status" className="me-2" />
          <span>Searching terminology...</span>
        </div>
      )}

      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
      
      {!isLoading && searchResults.length > 0 && (
        <div style={styles.resultsContainer}>
          <ListGroup variant="flush">
            {searchResults.map((item, index) => (
              <ListGroup.Item
                key={item.term + index} 
                action
                onClick={() => handleTermSelect(item)}
                style={styles.listItem}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = styles.listItemHover.backgroundColor}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ''}
              >
                <div className="fw-bold">{item.displayLabel || '[No Label]'} ({item.termTypeLabel || 'Resource'})</div>
                <small className="text-muted d-block">{item.displayComment || 'No comment or definition.'}</small>
                <small className="text-info d-block">URI: {item.term}</small>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </div>
      )}
       {!isLoading && searchResults.length === 0 && searchTerm.trim() && !error && (
        <Alert variant="info" className="mt-3">No terms found matching your query.</Alert>
      )}
    </div>
  );
}

export default React.memo(TerminologyService);
