export const sparqlExamples = [
  {
    title: "Standard",
    query: "SELECT * WHERE { ?s ?p ?o } LIMIT 10",
  },
  //Add more examples here if needed, e.g.:
   {
    title: "List of IRAC Vocabularies",
    query: "# Query the hierarchy of the IRAC Vocabulary(Insecticide Resistance Action Committee) of the MAPFI project. \n PREFIX irac: <http://srv.ktbl.de/data/irac/> \n PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> \n PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> \n \n SELECT ?groupCode ?groupLabel ?subgroupCode ?subgroupLabel ?ingredientLabel \n WHERE { GRAPH <https://fskx-graphdb.risk-ai-cloud.com/3ff722ca393651ab950a8fd2701df1ec/>{ \n # Get SubGroup and its Group \n ?subgroup a irac:SubGroup ; \n             rdfs:subClassOf ?group ; \n             rdfs:label ?subgroupLabel ; \n          irac:code ?subgroupCode . \n \n ?group a irac:Group ;\n   \n rdfs:label ?groupLabel ;         \n irac:code ?groupCode . \n # Get ActiveIngredients typed as the SubGroup \n OPTIONAL { \n  ?ingredient a irac:ActiveIngredient ; \n                 rdf:type ?subgroup ; \n                 rdfs:label ?ingredientLabel . \n   } \n} }\n ORDER BY ?groupCode ?subgroupCode ?ingredientLabel", 
//}",
   },
      {
    title: "Get Data from ZooMo",
    query: "#How many meat producing animals were sampled for Campylobacter coli during the Zoonoses Monitoring in Germany?  \n PREFIX obo: <http://purl.obolibrary.org/obo/> \n PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> \n \n SELECT  ?spezies ?isolat ?years (COUNT(?s) AS ?count )WHERE { \n ?s a obo:HSO_0000001; \n obo:HSO_0000213 ?years; \n  obo:HSO_0000242   ?SepziesID; \n obo:HSO_0000308  ?IsolateID. \n  ?SepziesID rdfs:label ?spezies.\n ?IsolateID rdfs:label ?isolat. \n FILTER ( regex(?isolat, \"C. coli\",  \"i\") )    # Query isolat \n FILTER ( regex(?spezies, \"Mast\",  \"i\"))# query all words with \"Mast\" \n } GROUP BY ?spezies ?isolat ?years", 
//}",
   },

];
