import sys
print('1', flush=True)
from pymongo import MongoClient
print('2', flush=True)
import numpy as np
print('3 - numpy imported', flush=True)
sys.stdout.flush()
import matplotlib
print('4 - matplotlib imported', flush=True)
matplotlib.use('Agg')
print('5 - backend set', flush=True)
import matplotlib.pyplot as plt
print('6 - pyplot imported', flush=True)
from flask import Flask
print('Done - all imports successful', flush=True)
