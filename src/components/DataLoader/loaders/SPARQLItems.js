export const sparqlExamples = [
  {
    title: "Standard",
    query: "SELECT * WHERE { ?s ?p ?o } LIMIT 10",
  },
  //Add more examples here if needed, e.g.:
   {
    title: "List of IRAC Vocabularies",
    query: "PREFIX irac: <http://srv.ktbl.de/data/irac/> \n PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> \n PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> \n \n SELECT ?groupCode ?groupLabel ?subgroupCode ?subgroupLabel ?ingredientLabel \n WHERE { \n # Get SubGroup and its Group \n ?subgroup a irac:SubGroup ; \n             rdfs:subClassOf ?group ; \n             rdfs:label ?subgroupLabel ; \n          irac:code ?subgroupCode . \n \n ?group a irac:Group ;\n   \n rdfs:label ?groupLabel ;         \n irac:code ?groupCode . \n # Get ActiveIngredients typed as the SubGroup \n OPTIONAL { \n  ?ingredient a irac:ActiveIngredient ; \n                 rdf:type ?subgroup ; \n                 rdfs:label ?ingredientLabel . \n   } \n} \n ORDER BY ?groupCode ?subgroupCode ?ingredientLabel", 
//}",
   },
];
