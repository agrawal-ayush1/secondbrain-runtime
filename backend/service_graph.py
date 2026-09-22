import networkx as nx
from typing import Dict, Any, List, Optional

class ServiceGraph:
    """Runtime Service Graph managing resource dependencies and alternative fallbacks using NetworkX."""

    def __init__(self):
        self.graph = nx.DiGraph()

    def add_resource(self, resource_id: str, attributes: Optional[Dict[str, Any]] = None) -> None:
        """Adds a service or resource as a node in the graph."""
        attrs = attributes or {}
        self.graph.add_node(resource_id, **attrs)

    def add_dependency(
        self,
        source_id: str,
        target_id: str,
        probability: float = 1.0,
        is_alternative: bool = False,
        **kwargs
    ) -> None:
        """Adds a directed dependency edge from source_id to target_id."""
        if not self.graph.has_node(source_id):
            self.add_resource(source_id)
        if not self.graph.has_node(target_id):
            self.add_resource(target_id)
            
        self.graph.add_edge(
            source_id,
            target_id,
            probability=probability,
            is_alternative=is_alternative,
            **kwargs
        )

    def add_alternative(self, resource_id: str, alternative_id: str, **kwargs) -> None:
        """Explicitly configures alternative_id as a fallback for resource_id."""
        if not self.graph.has_node(resource_id):
            self.add_resource(resource_id)
        if not self.graph.has_node(alternative_id):
            self.add_resource(alternative_id)
        
        self.graph.add_edge(resource_id, alternative_id, is_alternative=True, edge_type="alternative", **kwargs)
        
        alts = self.graph.nodes[resource_id].get("alternatives", [])
        if alternative_id not in alts:
            alts.append(alternative_id)
            self.graph.nodes[resource_id]["alternatives"] = alts

    def get_next_resources(self, resource_id: str) -> List[str]:
        """Returns downstream dependency resource IDs for a given resource."""
        if not self.graph.has_node(resource_id):
            return []
        
        next_res = []
        for target in self.graph.successors(resource_id):
            edge_data = self.graph.get_edge_data(resource_id, target, default={})
            if not edge_data.get("is_alternative", False) and edge_data.get("edge_type") != "alternative":
                next_res.append(target)
        return next_res

    def get_alternatives(self, resource_id: str) -> List[str]:
        """Returns explicitly defined alternative resource IDs for a resource."""
        if not self.graph.has_node(resource_id):
            return []
        
        alternatives = []
        # Check node metadata
        node_alts = self.graph.nodes[resource_id].get("alternatives", [])
        for alt in node_alts:
            if alt not in alternatives:
                alternatives.append(alt)
                
        # Check direct alternative edges
        for target in self.graph.successors(resource_id):
            edge_data = self.graph.get_edge_data(resource_id, target, default={})
            if edge_data.get("is_alternative", False) or edge_data.get("edge_type") == "alternative":
                if target not in alternatives:
                    alternatives.append(target)

        # Check sibling alternative targets under the same parent node
        for predecessor in self.graph.predecessors(resource_id):
            for successor in self.graph.successors(predecessor):
                if successor != resource_id:
                    edge_data = self.graph.get_edge_data(predecessor, successor, default={})
                    if edge_data.get("is_alternative", False):
                        if successor not in alternatives:
                            alternatives.append(successor)

        return alternatives
