import networkx as nx
G = nx.DiGraph()
G.add_node("A")
G.add_node("B")
G.add_edge("A", "B")
print(nx.node_link_data(G))
