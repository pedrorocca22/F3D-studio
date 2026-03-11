from stl import mesh
import numpy as np
cube = mesh.Mesh(np.zeros(12, dtype=mesh.Mesh.dtype))
cube.save("test_cube.stl")
