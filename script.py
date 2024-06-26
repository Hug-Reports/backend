# script.py
import sys
from pypi_json import PyPIJSON
import json


try:
    if len(sys.argv) > 1:
        packageName = sys.argv[1]
    else:
        packageName = ""

    with PyPIJSON() as client:
        requests_metadata = client.get_metadata(packageName)

    pkg = requests_metadata.info['project_urls']
    source_key = ""

    # check if Source
    for key in pkg: 
        if "source" in key.lower():
            source_key = key
            break
    if source_key == "":
        # check if Repository
        for key in pkg:
            if "repository" in key.lower():
                source_key = key
                break
    if source_key == "":
        # check if word github exists in the metadata
        for key in pkg:
            if "/github.com/" in pkg[key]:
                source_key = key
                break
    if source_key == "":
        githubURL = "No GitHub URL found"
    else:       
        githubURL = pkg[source_key]
    print(json.dumps({"githubURL": githubURL}))

except Exception:
    print(json.dumps({"githubURL": "No GitHub URL found"}))