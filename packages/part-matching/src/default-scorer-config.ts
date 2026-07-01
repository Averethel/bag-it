import type { PartPairScorerConfig } from "./contracts"

export const DEFAULT_PART_PAIR_SCORER_CONFIG: PartPairScorerConfig = {
  "featureNames": [
    "alignedAlpha8Distance",
    "alignedAlpha8Overlap",
    "alignedEdge8Distance",
    "alignedLuma8Distance",
    "alignmentScaleDelta",
    "alignmentShiftDistance",
    "alpha32Distance",
    "alpha32ShiftDistance",
    "alpha32ShiftRatio",
    "alphaDistance",
    "alphaEdgeDistance",
    "alphaEdge32Distance",
    "alphaOrientationDistance",
    "alphaShiftDistance",
    "alphaShiftRatio",
    "alphaCorrelation",
    "areaRatio",
    "aspectRatio",
    "centerDistance",
    "coverageDelta",
    "hasLuma",
    "leftProfileDistance",
    "lowerProfileDistance",
    "lowerSegmentDelta",
    "lumaCorrelation",
    "lumaDistance",
    "luma32Distance",
    "luma32ShiftDistance",
    "luma32ShiftRatio",
    "lumaEdgeCorrelation",
    "lumaEdgeDistance",
    "lumaEdgeShiftDistance",
    "lumaOrientationDistance",
    "lumaShiftDistance",
    "lumaShiftRatio",
    "nearConfidence",
    "profileMaxDistance",
    "projectionDistance",
    "rightProfileDistance",
    "silhouetteDistance",
    "silhouetteShiftDistance",
    "silhouetteShiftRatio",
    "tightAlpha32Distance",
    "tightAlpha32ShiftDistance",
    "tightAlpha32ShiftRatio",
    "tightAlphaEdge32Distance",
    "tightLuma32Distance",
    "tightLuma32ShiftDistance",
    "tightLuma32ShiftRatio",
    "topPeakDelta",
    "topProfileDistance",
    "wideAlpha32ShiftDistance",
    "wideAlpha32ShiftRatio",
    "wideLuma32ShiftDistance",
    "wideLuma32ShiftRatio",
    "wideSilhouetteShiftDistance",
    "wideSilhouetteShiftRatio"
  ],
  "intercept": 0,
  "kind": "decision-tree",
  "metadata": {
    "matcherVersion": "0.1.0-alpha.15",
    "model": "decision-tree+default-visual-evidence+veto-rules+evidence-rules+supplemental-rules+wide-shift+aligned-grid-features",
    "negativePairs": 39109,
    "positivePairs": 1320,
    "treeMaxDepth": 8,
    "treeMinLeafSize": 4,
    "gateDate": "2026-06-24",
    "activeLabelGroupScore": "558/1320 matched, 0 false groups, 762 missed, 0 crop drift",
    "activeLabelPairScore": "662 same-label pairs matched, 658 missed, 0 hard-negative false-positive pairs",
    "excludedRowGate": "role=excluded rows counted as singleton hard negatives against labeled and unlabeled same-bag rows",
    "policy": "Conservative app-visible near scorer; same-bag, cross-callout, color-compatible groups only. False groups are worse than misses.",
    "evidenceRuleConditionLimit": 3,
    "evidenceRuleCount": 12,
    "evidenceRuleMinConditions": 2,
    "supplementalRuleCount": 147,
    "promotedAt": "2026-06-24T12:40:00.000Z",
    "promotedReason": "Low-res alignment features plus residual-rule trainer; zero false groups across active labels",
    "sourceCandidate": "aligned-grid-ramp-2026-06-24",
    "wideShiftFeatureCount": 6,
    "alignmentFeatureCount": 6,
    "promotionNote": "Promoted only globally safe supplemental singleton from 2026-06-24 chamfer probe; broader subset failed active labels."
  },
  "normalization": {},
  "threshold": 0.9273514273504274,
  "tree": {
    "probability": 0.03286034353995519,
    "positiveCount": 1320,
    "totalCount": 40170,
    "featureName": "luma32ShiftDistance",
    "left": {
      "probability": 0.7614754098360655,
      "positiveCount": 929,
      "totalCount": 1220,
      "featureName": "areaRatio",
      "left": {
        "probability": 0.8409926470588235,
        "positiveCount": 915,
        "totalCount": 1088,
        "featureName": "tightLuma32ShiftDistance",
        "left": {
          "probability": 0.8900634249471459,
          "positiveCount": 842,
          "totalCount": 946,
          "featureName": "lowerSegmentDelta",
          "left": {
            "probability": 0.9032258064516129,
            "positiveCount": 840,
            "totalCount": 930,
            "featureName": "alphaShiftDistance",
            "left": {
              "probability": 0.9109663409337676,
              "positiveCount": 839,
              "totalCount": 921,
              "featureName": "luma32ShiftDistance",
              "left": {
                "probability": 0.9409340659340659,
                "positiveCount": 685,
                "totalCount": 728,
                "featureName": "tightLuma32ShiftDistance",
                "left": {
                  "probability": 0.996,
                  "positiveCount": 249,
                  "totalCount": 250,
                  "featureName": "tightAlpha32ShiftDistance",
                  "left": {
                    "probability": 1,
                    "positiveCount": 245,
                    "totalCount": 245
                  },
                  "right": {
                    "probability": 0.8,
                    "positiveCount": 4,
                    "totalCount": 5
                  },
                  "threshold": 15.56396484375
                },
                "right": {
                  "probability": 0.9121338912133892,
                  "positiveCount": 436,
                  "totalCount": 478,
                  "featureName": "alphaOrientationDistance",
                  "left": {
                    "probability": 0.2,
                    "positiveCount": 2,
                    "totalCount": 10
                  },
                  "right": {
                    "probability": 0.9273504273504274,
                    "positiveCount": 434,
                    "totalCount": 468
                  },
                  "threshold": 0.0061740092734416715
                },
                "threshold": 7.7294921875
              },
              "right": {
                "probability": 0.7979274611398963,
                "positiveCount": 154,
                "totalCount": 193,
                "featureName": "profileMaxDistance",
                "left": {
                  "probability": 0.125,
                  "positiveCount": 1,
                  "totalCount": 8,
                  "featureName": "alpha32Distance",
                  "left": {
                    "probability": 0,
                    "positiveCount": 0,
                    "totalCount": 4
                  },
                  "right": {
                    "probability": 0.25,
                    "positiveCount": 1,
                    "totalCount": 4
                  },
                  "threshold": 7.32421875
                },
                "right": {
                  "probability": 0.827027027027027,
                  "positiveCount": 153,
                  "totalCount": 185,
                  "featureName": "alpha32ShiftDistance",
                  "left": {
                    "probability": 0.8928571428571429,
                    "positiveCount": 125,
                    "totalCount": 140
                  },
                  "right": {
                    "probability": 0.6222222222222222,
                    "positiveCount": 28,
                    "totalCount": 45
                  },
                  "threshold": 9.7109375
                },
                "threshold": 0.012500000000000008
              },
              "threshold": 7.14111328125
            },
            "right": {
              "probability": 0.1111111111111111,
              "positiveCount": 1,
              "totalCount": 9,
              "featureName": "alpha32Distance",
              "left": {
                "probability": 0.25,
                "positiveCount": 1,
                "totalCount": 4
              },
              "right": {
                "probability": 0,
                "positiveCount": 0,
                "totalCount": 5
              },
              "threshold": 25.08203125
            },
            "threshold": 16.857421875
          },
          "right": {
            "probability": 0.125,
            "positiveCount": 2,
            "totalCount": 16,
            "featureName": "alpha32ShiftRatio",
            "left": {
              "probability": 0.5,
              "positiveCount": 2,
              "totalCount": 4
            },
            "right": {
              "probability": 0,
              "positiveCount": 0,
              "totalCount": 12
            },
            "threshold": 0.8823579642567927
          },
          "threshold": 0.5
        },
        "right": {
          "probability": 0.5140845070422535,
          "positiveCount": 73,
          "totalCount": 142,
          "featureName": "coverageDelta",
          "left": {
            "probability": 0.5966386554621849,
            "positiveCount": 71,
            "totalCount": 119,
            "featureName": "leftProfileDistance",
            "left": {
              "probability": 0,
              "positiveCount": 0,
              "totalCount": 10
            },
            "right": {
              "probability": 0.6513761467889908,
              "positiveCount": 71,
              "totalCount": 109,
              "featureName": "lumaCorrelation",
              "left": {
                "probability": 0.5526315789473685,
                "positiveCount": 42,
                "totalCount": 76,
                "featureName": "lumaDistance",
                "left": {
                  "probability": 0,
                  "positiveCount": 0,
                  "totalCount": 12
                },
                "right": {
                  "probability": 0.65625,
                  "positiveCount": 42,
                  "totalCount": 64,
                  "featureName": "profileMaxDistance",
                  "left": {
                    "probability": 0.2,
                    "positiveCount": 2,
                    "totalCount": 10
                  },
                  "right": {
                    "probability": 0.7407407407407407,
                    "positiveCount": 40,
                    "totalCount": 54
                  },
                  "threshold": 0.05833333333333334
                },
                "threshold": 8.482421875
              },
              "right": {
                "probability": 0.8787878787878788,
                "positiveCount": 29,
                "totalCount": 33,
                "featureName": "leftProfileDistance",
                "left": {
                  "probability": 1,
                  "positiveCount": 21,
                  "totalCount": 21
                },
                "right": {
                  "probability": 0.6666666666666666,
                  "positiveCount": 8,
                  "totalCount": 12,
                  "featureName": "lumaCorrelation",
                  "left": {
                    "probability": 1,
                    "positiveCount": 6,
                    "totalCount": 6
                  },
                  "right": {
                    "probability": 0.3333333333333333,
                    "positiveCount": 2,
                    "totalCount": 6
                  },
                  "threshold": 0.6044446888694471
                },
                "threshold": 0.05
              },
              "threshold": 0.5679860006627189
            },
            "threshold": 0.016666666666666663
          },
          "right": {
            "probability": 0.08695652173913043,
            "positiveCount": 2,
            "totalCount": 23,
            "featureName": "centerDistance",
            "left": {
              "probability": 0.3333333333333333,
              "positiveCount": 2,
              "totalCount": 6
            },
            "right": {
              "probability": 0,
              "positiveCount": 0,
              "totalCount": 17
            },
            "threshold": 0.03197026909132576
          },
          "threshold": 0.023460477941176477
        },
        "threshold": 21.78564453125
      },
      "right": {
        "probability": 0.10606060606060606,
        "positiveCount": 14,
        "totalCount": 132,
        "featureName": "tightAlpha32Distance",
        "left": {
          "probability": 1,
          "positiveCount": 5,
          "totalCount": 5
        },
        "right": {
          "probability": 0.07086614173228346,
          "positiveCount": 9,
          "totalCount": 127,
          "featureName": "luma32ShiftRatio",
          "left": {
            "probability": 0.2857142857142857,
            "positiveCount": 6,
            "totalCount": 21,
            "featureName": "aspectRatio",
            "left": {
              "probability": 0.7142857142857143,
              "positiveCount": 5,
              "totalCount": 7
            },
            "right": {
              "probability": 0.07142857142857142,
              "positiveCount": 1,
              "totalCount": 14,
              "featureName": "alpha32Distance",
              "left": {
                "probability": 0.25,
                "positiveCount": 1,
                "totalCount": 4
              },
              "right": {
                "probability": 0,
                "positiveCount": 0,
                "totalCount": 10
              },
              "threshold": 15.0068359375
            },
            "threshold": 1.0652656309801598
          },
          "right": {
            "probability": 0.02830188679245283,
            "positiveCount": 3,
            "totalCount": 106,
            "featureName": "lumaCorrelation",
            "left": {
              "probability": 0.010416666666666666,
              "positiveCount": 1,
              "totalCount": 96,
              "featureName": "coverageDelta",
              "left": {
                "probability": 0,
                "positiveCount": 0,
                "totalCount": 92
              },
              "right": {
                "probability": 0.25,
                "positiveCount": 1,
                "totalCount": 4
              },
              "threshold": 0.0793045343137255
            },
            "right": {
              "probability": 0.2,
              "positiveCount": 2,
              "totalCount": 10,
              "featureName": "alpha32Distance",
              "left": {
                "probability": 0,
                "positiveCount": 0,
                "totalCount": 6
              },
              "right": {
                "probability": 0.5,
                "positiveCount": 2,
                "totalCount": 4
              },
              "threshold": 12.08642578125
            },
            "threshold": 0.585790382825361
          },
          "threshold": 0.7775763299442524
        },
        "threshold": 7.67333984375
      },
      "threshold": 1.1611629322424948
    },
    "right": {
      "probability": 0.010038510911424903,
      "positiveCount": 391,
      "totalCount": 38950,
      "featureName": "tightLuma32ShiftRatio",
      "left": {
        "probability": 0.6872037914691943,
        "positiveCount": 145,
        "totalCount": 211,
        "featureName": "tightLuma32ShiftRatio",
        "left": {
          "probability": 0.8981481481481481,
          "positiveCount": 97,
          "totalCount": 108,
          "featureName": "silhouetteShiftDistance",
          "left": {
            "probability": 0.93,
            "positiveCount": 93,
            "totalCount": 100,
            "featureName": "areaRatio",
            "left": {
              "probability": 0.7647058823529411,
              "positiveCount": 13,
              "totalCount": 17,
              "featureName": "tightLuma32ShiftDistance",
              "left": {
                "probability": 1,
                "positiveCount": 10,
                "totalCount": 10
              },
              "right": {
                "probability": 0.42857142857142855,
                "positiveCount": 3,
                "totalCount": 7
              },
              "threshold": 15.341796875
            },
            "right": {
              "probability": 0.963855421686747,
              "positiveCount": 80,
              "totalCount": 83,
              "featureName": "luma32Distance",
              "left": {
                "probability": 0.8,
                "positiveCount": 8,
                "totalCount": 10,
                "featureName": "alpha32Distance",
                "left": {
                  "probability": 1,
                  "positiveCount": 6,
                  "totalCount": 6
                },
                "right": {
                  "probability": 0.5,
                  "positiveCount": 2,
                  "totalCount": 4
                },
                "threshold": 10.3427734375
              },
              "right": {
                "probability": 0.9863013698630136,
                "positiveCount": 72,
                "totalCount": 73,
                "featureName": "alpha32Distance",
                "left": {
                  "probability": 0.75,
                  "positiveCount": 3,
                  "totalCount": 4
                },
                "right": {
                  "probability": 1,
                  "positiveCount": 69,
                  "totalCount": 69
                },
                "threshold": 9.8046875
              },
              "threshold": 9.4384765625
            },
            "threshold": 1.0237506185056904
          },
          "right": {
            "probability": 0.5,
            "positiveCount": 4,
            "totalCount": 8,
            "featureName": "alpha32Distance",
            "left": {
              "probability": 0.75,
              "positiveCount": 3,
              "totalCount": 4
            },
            "right": {
              "probability": 0.25,
              "positiveCount": 1,
              "totalCount": 4
            },
            "threshold": 21.8896484375
          },
          "threshold": 22.902374267578125
        },
        "right": {
          "probability": 0.46601941747572817,
          "positiveCount": 48,
          "totalCount": 103,
          "featureName": "tightAlpha32Distance",
          "left": {
            "probability": 0.8148148148148148,
            "positiveCount": 22,
            "totalCount": 27,
            "featureName": "alphaEdge32Distance",
            "left": {
              "probability": 0.6428571428571429,
              "positiveCount": 9,
              "totalCount": 14,
              "featureName": "lumaDistance",
              "left": {
                "probability": 1,
                "positiveCount": 8,
                "totalCount": 8
              },
              "right": {
                "probability": 0.16666666666666666,
                "positiveCount": 1,
                "totalCount": 6
              },
              "threshold": 9.876953125
            },
            "right": {
              "probability": 1,
              "positiveCount": 13,
              "totalCount": 13
            },
            "threshold": 19.8349609375
          },
          "right": {
            "probability": 0.34210526315789475,
            "positiveCount": 26,
            "totalCount": 76,
            "featureName": "alphaShiftDistance",
            "left": {
              "probability": 0.49056603773584906,
              "positiveCount": 26,
              "totalCount": 53,
              "featureName": "tightAlpha32ShiftDistance",
              "left": {
                "probability": 0.35135135135135137,
                "positiveCount": 13,
                "totalCount": 37,
                "featureName": "tightLuma32Distance",
                "left": {
                  "probability": 0.75,
                  "positiveCount": 6,
                  "totalCount": 8,
                  "featureName": "alpha32ShiftDistance",
                  "left": {
                    "probability": 1,
                    "positiveCount": 4,
                    "totalCount": 4
                  },
                  "right": {
                    "probability": 0.5,
                    "positiveCount": 2,
                    "totalCount": 4
                  },
                  "threshold": 10.837890625
                },
                "right": {
                  "probability": 0.2413793103448276,
                  "positiveCount": 7,
                  "totalCount": 29,
                  "featureName": "tightAlpha32ShiftRatio",
                  "left": {
                    "probability": 0.06666666666666667,
                    "positiveCount": 1,
                    "totalCount": 15
                  },
                  "right": {
                    "probability": 0.42857142857142855,
                    "positiveCount": 6,
                    "totalCount": 14
                  },
                  "threshold": 0.6477753280643734
                },
                "threshold": 23.24560546875
              },
              "right": {
                "probability": 0.8125,
                "positiveCount": 13,
                "totalCount": 16,
                "featureName": "alphaCorrelation",
                "left": {
                  "probability": 0.25,
                  "positiveCount": 1,
                  "totalCount": 4
                },
                "right": {
                  "probability": 1,
                  "positiveCount": 12,
                  "totalCount": 12
                },
                "threshold": 0.8445932636205737
              },
              "threshold": 26.1806640625
            },
            "right": {
              "probability": 0,
              "positiveCount": 0,
              "totalCount": 23
            },
            "threshold": 15.908203125
          },
          "threshold": 24.56298828125
        },
        "threshold": 0.6847602633915048
      },
      "right": {
        "probability": 0.006350189731278557,
        "positiveCount": 246,
        "totalCount": 38739,
        "featureName": "lumaCorrelation",
        "left": {
          "probability": 0.004389040384365667,
          "positiveCount": 169,
          "totalCount": 38505,
          "featureName": "luma32ShiftRatio",
          "left": {
            "probability": 0.5263157894736842,
            "positiveCount": 30,
            "totalCount": 57,
            "featureName": "luma32ShiftRatio",
            "left": {
              "probability": 1,
              "positiveCount": 10,
              "totalCount": 10
            },
            "right": {
              "probability": 0.425531914893617,
              "positiveCount": 20,
              "totalCount": 47,
              "featureName": "lumaDistance",
              "left": {
                "probability": 0.7222222222222222,
                "positiveCount": 13,
                "totalCount": 18,
                "featureName": "alpha32Distance",
                "left": {
                  "probability": 0.9230769230769231,
                  "positiveCount": 12,
                  "totalCount": 13,
                  "featureName": "alpha32Distance",
                  "left": {
                    "probability": 0.75,
                    "positiveCount": 3,
                    "totalCount": 4
                  },
                  "right": {
                    "probability": 1,
                    "positiveCount": 9,
                    "totalCount": 9
                  },
                  "threshold": 15.5966796875
                },
                "right": {
                  "probability": 0.2,
                  "positiveCount": 1,
                  "totalCount": 5
                },
                "threshold": 21.859375
              },
              "right": {
                "probability": 0.2413793103448276,
                "positiveCount": 7,
                "totalCount": 29,
                "featureName": "lumaShiftRatio",
                "left": {
                  "probability": 0.7142857142857143,
                  "positiveCount": 5,
                  "totalCount": 7
                },
                "right": {
                  "probability": 0.09090909090909091,
                  "positiveCount": 2,
                  "totalCount": 22,
                  "featureName": "luma32ShiftRatio",
                  "left": {
                    "probability": 0.3333333333333333,
                    "positiveCount": 2,
                    "totalCount": 6
                  },
                  "right": {
                    "probability": 0,
                    "positiveCount": 0,
                    "totalCount": 16
                  },
                  "threshold": 0.6571008580685828
                },
                "threshold": 0.6067504050939757
              },
              "threshold": 14.01171875
            },
            "threshold": 0.6114258369370293
          },
          "right": {
            "probability": 0.003615272575946733,
            "positiveCount": 139,
            "totalCount": 38448,
            "featureName": "tightLuma32Distance",
            "left": {
              "probability": 0.7333333333333333,
              "positiveCount": 11,
              "totalCount": 15,
              "featureName": "tightLuma32ShiftRatio",
              "left": {
                "probability": 0,
                "positiveCount": 0,
                "totalCount": 4
              },
              "right": {
                "probability": 1,
                "positiveCount": 11,
                "totalCount": 11
              },
              "threshold": 0.9829970927671571
            },
            "right": {
              "probability": 0.003330471209637551,
              "positiveCount": 128,
              "totalCount": 38433,
              "featureName": "lumaCorrelation",
              "left": {
                "probability": 0.0019324950363997352,
                "positiveCount": 73,
                "totalCount": 37775,
                "featureName": "luma32ShiftRatio",
                "left": {
                  "probability": 0.0942622950819672,
                  "positiveCount": 23,
                  "totalCount": 244,
                  "featureName": "luma32ShiftDistance",
                  "left": {
                    "probability": 0.38235294117647056,
                    "positiveCount": 13,
                    "totalCount": 34
                  },
                  "right": {
                    "probability": 0.047619047619047616,
                    "positiveCount": 10,
                    "totalCount": 210
                  },
                  "threshold": 8.81103515625
                },
                "right": {
                  "probability": 0.0013322320215288694,
                  "positiveCount": 50,
                  "totalCount": 37531,
                  "featureName": "tightAlpha32ShiftDistance",
                  "left": {
                    "probability": 0.058577405857740586,
                    "positiveCount": 14,
                    "totalCount": 239
                  },
                  "right": {
                    "probability": 0.0009653544996245844,
                    "positiveCount": 36,
                    "totalCount": 37292
                  },
                  "threshold": 16.7177734375
                },
                "threshold": 0.7725571794553803
              },
              "right": {
                "probability": 0.08358662613981763,
                "positiveCount": 55,
                "totalCount": 658,
                "featureName": "luma32ShiftRatio",
                "left": {
                  "probability": 0.631578947368421,
                  "positiveCount": 12,
                  "totalCount": 19,
                  "featureName": "lumaEdgeDistance",
                  "left": {
                    "probability": 1,
                    "positiveCount": 11,
                    "totalCount": 11
                  },
                  "right": {
                    "probability": 0.125,
                    "positiveCount": 1,
                    "totalCount": 8
                  },
                  "threshold": 16.33203125
                },
                "right": {
                  "probability": 0.06729264475743349,
                  "positiveCount": 43,
                  "totalCount": 639,
                  "featureName": "areaRatio",
                  "left": {
                    "probability": 0.1951219512195122,
                    "positiveCount": 32,
                    "totalCount": 164
                  },
                  "right": {
                    "probability": 0.023157894736842106,
                    "positiveCount": 11,
                    "totalCount": 475
                  },
                  "threshold": 1.1219215567041654
                },
                "threshold": 0.7785710545953148
              },
              "threshold": 0.48438863049653313
            },
            "threshold": 11.67724609375
          },
          "threshold": 0.7077020726302912
        },
        "right": {
          "probability": 0.32905982905982906,
          "positiveCount": 77,
          "totalCount": 234,
          "featureName": "luma32ShiftDistance",
          "left": {
            "probability": 0.5638297872340425,
            "positiveCount": 53,
            "totalCount": 94,
            "featureName": "alphaCorrelation",
            "left": {
              "probability": 0.3584905660377358,
              "positiveCount": 19,
              "totalCount": 53,
              "featureName": "luma32ShiftRatio",
              "left": {
                "probability": 0.7368421052631579,
                "positiveCount": 14,
                "totalCount": 19,
                "featureName": "projectionDistance",
                "left": {
                  "probability": 0,
                  "positiveCount": 0,
                  "totalCount": 4
                },
                "right": {
                  "probability": 0.9333333333333333,
                  "positiveCount": 14,
                  "totalCount": 15,
                  "featureName": "alpha32ShiftRatio",
                  "left": {
                    "probability": 0.75,
                    "positiveCount": 3,
                    "totalCount": 4
                  },
                  "right": {
                    "probability": 1,
                    "positiveCount": 11,
                    "totalCount": 11
                  },
                  "threshold": 0.7852972024363538
                },
                "threshold": 0.03033854166666667
              },
              "right": {
                "probability": 0.14705882352941177,
                "positiveCount": 5,
                "totalCount": 34,
                "featureName": "lowerProfileDistance",
                "left": {
                  "probability": 0.5714285714285714,
                  "positiveCount": 4,
                  "totalCount": 7
                },
                "right": {
                  "probability": 0.037037037037037035,
                  "positiveCount": 1,
                  "totalCount": 27,
                  "featureName": "alpha32Distance",
                  "left": {
                    "probability": 0,
                    "positiveCount": 0,
                    "totalCount": 23
                  },
                  "right": {
                    "probability": 0.25,
                    "positiveCount": 1,
                    "totalCount": 4
                  },
                  "threshold": 14.162109375
                },
                "threshold": 0.01666666666666667
              },
              "threshold": 0.9665539338063649
            },
            "right": {
              "probability": 0.8292682926829268,
              "positiveCount": 34,
              "totalCount": 41,
              "featureName": "centerDistance",
              "left": {
                "probability": 0.25,
                "positiveCount": 1,
                "totalCount": 4
              },
              "right": {
                "probability": 0.8918918918918919,
                "positiveCount": 33,
                "totalCount": 37,
                "featureName": "silhouetteDistance",
                "left": {
                  "probability": 1,
                  "positiveCount": 26,
                  "totalCount": 26
                },
                "right": {
                  "probability": 0.6363636363636364,
                  "positiveCount": 7,
                  "totalCount": 11,
                  "featureName": "lowerProfileDistance",
                  "left": {
                    "probability": 0.2,
                    "positiveCount": 1,
                    "totalCount": 5
                  },
                  "right": {
                    "probability": 1,
                    "positiveCount": 6,
                    "totalCount": 6
                  },
                  "threshold": 0.035416666666666666
                },
                "threshold": 10.606842041015625
              },
              "threshold": 0.009170578716272415
            },
            "threshold": 0.9649783699739272
          },
          "right": {
            "probability": 0.17142857142857143,
            "positiveCount": 24,
            "totalCount": 140,
            "featureName": "tightLuma32ShiftDistance",
            "left": {
              "probability": 0.7272727272727273,
              "positiveCount": 8,
              "totalCount": 11,
              "featureName": "leftProfileDistance",
              "left": {
                "probability": 0.25,
                "positiveCount": 1,
                "totalCount": 4
              },
              "right": {
                "probability": 1,
                "positiveCount": 7,
                "totalCount": 7
              },
              "threshold": 0.027083333333333334
            },
            "right": {
              "probability": 0.12403100775193798,
              "positiveCount": 16,
              "totalCount": 129,
              "featureName": "luma32ShiftRatio",
              "left": {
                "probability": 1,
                "positiveCount": 4,
                "totalCount": 4
              },
              "right": {
                "probability": 0.096,
                "positiveCount": 12,
                "totalCount": 125,
                "featureName": "lumaCorrelation",
                "left": {
                  "probability": 0.06666666666666667,
                  "positiveCount": 8,
                  "totalCount": 120,
                  "featureName": "tightAlphaEdge32Distance",
                  "left": {
                    "probability": 0.044642857142857144,
                    "positiveCount": 5,
                    "totalCount": 112
                  },
                  "right": {
                    "probability": 0.375,
                    "positiveCount": 3,
                    "totalCount": 8
                  },
                  "threshold": 45.5068359375
                },
                "right": {
                  "probability": 0.8,
                  "positiveCount": 4,
                  "totalCount": 5
                },
                "threshold": 0.7462940368428459
              },
              "threshold": 0.8268088474469943
            },
            "threshold": 14.81982421875
          },
          "threshold": 9.35400390625
        },
        "threshold": 0.5901033190014737
      },
      "threshold": 0.744349976389683
    },
    "threshold": 7.99755859375
  },
  "version": "0.1.0-alpha.10",
  "weights": {},
  "vetoRules": [
    {
      "conditions": [
        {
          "featureName": "lumaCorrelation",
          "operator": "lt",
          "threshold": 0.587
        },
        {
          "featureName": "leftProfileDistance",
          "operator": "gt",
          "threshold": 0.0541
        }
      ]
    }
  ],
  "evidenceRules": [
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 1.0000001
        },
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0279830945744
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 1.0000001
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.963018805655
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32Distance",
          "operator": "lt",
          "threshold": 23.8408204125
        },
        {
          "featureName": "leftProfileDistance",
          "operator": "lt",
          "threshold": 0.050000100000000006
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32Distance",
          "operator": "lt",
          "threshold": 23.8408204125
        },
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.594365584011
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32Distance",
          "operator": "lt",
          "threshold": 15.8906251
        },
        {
          "featureName": "projectionDistance",
          "operator": "lt",
          "threshold": 0.0270834333333
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 1.0000001
        },
        {
          "featureName": "centerDistance",
          "operator": "lt",
          "threshold": 0.0197778237844
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignmentScaleDelta",
          "operator": "lt",
          "threshold": 0.1250001
        },
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0279830945744
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignmentScaleDelta",
          "operator": "lt",
          "threshold": 0.1250001
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.963018805655
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignedAlpha8Distance",
          "operator": "lt",
          "threshold": 26.7187501
        },
        {
          "featureName": "leftProfileDistance",
          "operator": "lt",
          "threshold": 0.050000100000000006
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignedAlpha8Distance",
          "operator": "lt",
          "threshold": 19.7656251
        },
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.594365584011
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignedAlpha8Distance",
          "operator": "lt",
          "threshold": 14.26953135
        },
        {
          "featureName": "projectionDistance",
          "operator": "lt",
          "threshold": 0.0270834333333
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignedEdge8Distance",
          "operator": "lt",
          "threshold": 25.23046885
        },
        {
          "featureName": "centerDistance",
          "operator": "lt",
          "threshold": 0.0197778237844
        }
      ]
    }
  ],
  "supplementalRules": [
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0258974456107
        },
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 4.7607422875
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0515745285505
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0724015336900001
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.510418959188
        },
        {
          "featureName": "rightProfileDistance",
          "operator": "lt",
          "threshold": 0.0833334333333
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.7412114511219999
        },
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.0937501
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 6.044921975
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "lumaDistance",
          "operator": "lt",
          "threshold": 6.23828135
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0151212475024
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.730834214339
        },
        {
          "featureName": "lumaEdgeCorrelation",
          "operator": "gt",
          "threshold": 0.8055835869650001
        },
        {
          "featureName": "silhouetteDistance",
          "operator": "lt",
          "threshold": 10.879211525799999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0171450013384
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.596816158142
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.98128159748
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 6.998046975
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.8345682327959999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.012627495034899999
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 7.0791016625
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.699413083425
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaCorrelation",
          "operator": "gt",
          "threshold": 0.971905080972
        },
        {
          "featureName": "lowerProfileDistance",
          "operator": "lt",
          "threshold": 0.00833343333333
        },
        {
          "featureName": "lumaDistance",
          "operator": "lt",
          "threshold": 4.37890635
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "coverageDelta",
          "operator": "lt",
          "threshold": 0.000275835294118
        },
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.5661000616090001
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.0937501
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 5.451171975
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.9469403193139999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32Distance",
          "operator": "lt",
          "threshold": 10.2099610375
        },
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.7537850794800001
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0151212475024
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaCorrelation",
          "operator": "gt",
          "threshold": 0.8333274873530001
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0154321987700001
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.596816158142
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.876161090712
        },
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.6920636613660001
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.64117604813
        },
        {
          "featureName": "silhouetteShiftRatio",
          "operator": "lt",
          "threshold": 0.7347730789589999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 7.0791016625
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.011080037155899999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0312501
        },
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 8.7431641625
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.699413083425
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 6.5781251
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.913213213194
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.444318924194
        },
        {
          "featureName": "lumaShiftDistance",
          "operator": "lt",
          "threshold": 7.1250001
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaCorrelation",
          "operator": "gt",
          "threshold": 0.982170777439
        },
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 4.7607422875
        },
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.636815246508
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 4.4892579125
        },
        {
          "featureName": "lumaDistance",
          "operator": "lt",
          "threshold": 5.3046876
        },
        {
          "featureName": "projectionDistance",
          "operator": "lt",
          "threshold": 0.0230239970588
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.519940833424
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.08994207292
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 6.044921975
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "coverageDelta",
          "operator": "lt",
          "threshold": 0.00333956078431
        },
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.7182129673240001
        },
        {
          "featureName": "lumaDistance",
          "operator": "lt",
          "threshold": 5.3046876
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.8345682327959999
        },
        {
          "featureName": "silhouetteDistance",
          "operator": "lt",
          "threshold": 7.65747080313
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.444318924194
        },
        {
          "featureName": "silhouetteShiftDistance",
          "operator": "lt",
          "threshold": 14.567871193799999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.7697866353039999
        },
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 6.998046975
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaCorrelation",
          "operator": "gt",
          "threshold": 0.95276227393
        },
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.938592725239
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0258974456107
        },
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.0937501
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.510418959188
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftDistance",
          "operator": "lt",
          "threshold": 11.0546876
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.06557387049
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.510418959188
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0258974456107
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.730834214339
        },
        {
          "featureName": "silhouetteDistance",
          "operator": "lt",
          "threshold": 10.879211525799999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.636815246508
        },
        {
          "featureName": "rightProfileDistance",
          "operator": "lt",
          "threshold": 1e-7
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.596816158142
        },
        {
          "featureName": "rightProfileDistance",
          "operator": "lt",
          "threshold": 0.0250001
        },
        {
          "featureName": "silhouetteShiftRatio",
          "operator": "lt",
          "threshold": 0.891096494408
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0026042666700001
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.5981427762349999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaEdge32Distance",
          "operator": "lt",
          "threshold": 12.466796975
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.876161090712
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.876161090712
        },
        {
          "featureName": "silhouetteDistance",
          "operator": "lt",
          "threshold": 5.82092295156
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaEdge32Distance",
          "operator": "lt",
          "threshold": 17.2587891625
        },
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.8328454553369999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.7412114511219999
        },
        {
          "featureName": "silhouetteDistance",
          "operator": "lt",
          "threshold": 12.093200783599999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.636815246508
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.9469403193139999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaCorrelation",
          "operator": "gt",
          "threshold": 0.971905080972
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 5.80078135
        },
        {
          "featureName": "lumaDistance",
          "operator": "lt",
          "threshold": 4.37890635
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "lowerProfileDistance",
          "operator": "lt",
          "threshold": 0.00833343333333
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 4.4892579125
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0261764229075
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "lowerProfileDistance",
          "operator": "lt",
          "threshold": 0.00833343333333
        },
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 7.8896485375
        },
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.8060000648000001
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.938592725239
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.08994207292
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 5.451171975
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaCorrelation",
          "operator": "gt",
          "threshold": 0.9791061177970001
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 5.1005860375
        },
        {
          "featureName": "profileMaxDistance",
          "operator": "lt",
          "threshold": 0.0125001
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32Distance",
          "operator": "lt",
          "threshold": 7.3486329125
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0026042666700001
        },
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.8060000648000001
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 6.052734475
        },
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.7182129673240001
        },
        {
          "featureName": "profileMaxDistance",
          "operator": "lt",
          "threshold": 0.00833343333333
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.00367207062
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.596816158142
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 5.80078135
        },
        {
          "featureName": "lumaDistance",
          "operator": "lt",
          "threshold": 5.3046876
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0165452682992
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.7182129673240001
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0128736816444
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0171450013384
        },
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.938592725239
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.596816158142
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaEdge32Distance",
          "operator": "lt",
          "threshold": 15.45703135
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.730834214339
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.011080037155899999
        },
        {
          "featureName": "lumaShiftDistance",
          "operator": "lt",
          "threshold": 7.41796885
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.011532743891499999
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.730834214339
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0154321987700001
        },
        {
          "featureName": "lumaDistance",
          "operator": "lt",
          "threshold": 5.3046876
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0165452682992
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0171450013384
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.5981427762349999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.699413083425
        },
        {
          "featureName": "rightProfileDistance",
          "operator": "lt",
          "threshold": 0.0125001
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 8.7431641625
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.699413083425
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.98128159748
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.6677303701549999
        },
        {
          "featureName": "projectionDistance",
          "operator": "lt",
          "threshold": 0.024326080392199998
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.454815618983
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.00036085036
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.9745392587739999
        },
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 5.255859475
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "lumaEdgeCorrelation",
          "operator": "gt",
          "threshold": 0.8543211995340001
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0095718395112
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.616918428189
        },
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 7.8896485375
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.64117604813
        },
        {
          "featureName": "lumaEdgeCorrelation",
          "operator": "gt",
          "threshold": 0.906789646597
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.699413083425
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.011080037155899999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.7182129673240001
        },
        {
          "featureName": "silhouetteShiftRatio",
          "operator": "lt",
          "threshold": 0.9259260259259999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaCorrelation",
          "operator": "gt",
          "threshold": 0.8907004819190001
        },
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.385717486586
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.385717486586
        },
        {
          "featureName": "coverageDelta",
          "operator": "lt",
          "threshold": 0.00333956078431
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.486367734125
        },
        {
          "featureName": "silhouetteDistance",
          "operator": "lt",
          "threshold": 15.4705811547
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.796088403641
        },
        {
          "featureName": "rightProfileDistance",
          "operator": "lt",
          "threshold": 0.00416676666667
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaCorrelation",
          "operator": "gt",
          "threshold": 0.946317047716
        },
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.8328454553369999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "leftProfileDistance",
          "operator": "lt",
          "threshold": 0.00833343333333
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.730834214339
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.8345682327959999
        },
        {
          "featureName": "rightProfileDistance",
          "operator": "lt",
          "threshold": 1e-7
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.486367734125
        },
        {
          "featureName": "topProfileDistance",
          "operator": "lt",
          "threshold": 0.0208334333333
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.41393738223
        },
        {
          "featureName": "leftProfileDistance",
          "operator": "lt",
          "threshold": 0.00833343333333
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.8328454553369999
        },
        {
          "featureName": "silhouetteDistance",
          "operator": "lt",
          "threshold": 8.65356455313
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.753854725551
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0937501
        },
        {
          "featureName": "wideLuma32ShiftDistance",
          "operator": "lt",
          "threshold": 6.0849610375
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.0750001
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.493382117344
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.9651417122
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0130090283068
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.6970139383099999
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0395701111441
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.993315106872
        },
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 6.4189454125
        },
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.609152962537
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.09950748916
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.6704555615069999
        },
        {
          "featureName": "silhouetteShiftRatio",
          "operator": "lt",
          "threshold": 0.707207307207
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.08695662174
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.610344008291
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0164630674955
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.6847474342609999
        },
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0181578589646
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.6426961661489999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.01601840664
        },
        {
          "featureName": "rightProfileDistance",
          "operator": "lt",
          "threshold": 0.0916667666667
        },
        {
          "featureName": "wideLuma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.5295939104449999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.588899303596
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0937501
        },
        {
          "featureName": "lumaShiftDistance",
          "operator": "lt",
          "threshold": 6.06640635
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0257061445194
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.720973363022
        },
        {
          "featureName": "silhouetteDistance",
          "operator": "lt",
          "threshold": 11.0659791039
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 6.68359385
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.9267909685379999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaCorrelation",
          "operator": "gt",
          "threshold": 0.83826468557
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0128206128200001
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.610344008291
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftDistance",
          "operator": "lt",
          "threshold": 6.55078135
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0937501
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.6970139383099999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftDistance",
          "operator": "lt",
          "threshold": 9.392578225
        },
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.384419515393
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.03703713704
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0937501
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 5.4853516625
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.9651417122
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.753854725551
        },
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.0750001
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 6.091796975
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.9850137239779999
        },
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.08695662174
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 5.7177735375
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0937501
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.531352598553
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.7529676970479999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftDistance",
          "operator": "lt",
          "threshold": 7.2265626
        },
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.0500001
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.6426961661489999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0128206128200001
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 8.93359385
        },
        {
          "featureName": "wideAlpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.433444522662
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.616161716162
        },
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 7.9970704125
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.714331539545
        },
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.6808916860980001
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.5993616323219999
        },
        {
          "featureName": "rightProfileDistance",
          "operator": "lt",
          "threshold": 0.00833343333333
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftDistance",
          "operator": "lt",
          "threshold": 10.154296975
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0217392304300001
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.572761456701
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.464267452185
        },
        {
          "featureName": "lumaEdgeCorrelation",
          "operator": "gt",
          "threshold": 0.633031138651
        },
        {
          "featureName": "wideLuma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.562408323201
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0181578589646
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.9651417122
        },
        {
          "featureName": "wideLuma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.562408323201
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0937501
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 4.6298829125
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.531352598553
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.5993616323219999
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.528597549909
        },
        {
          "featureName": "silhouetteShiftDistance",
          "operator": "lt",
          "threshold": 18.9413453148
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.0606061606100001
        },
        {
          "featureName": "lumaDistance",
          "operator": "lt",
          "threshold": 12.3281251
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.5772297015179999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.46605897522
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0937501
        },
        {
          "featureName": "lumaShiftDistance",
          "operator": "lt",
          "threshold": 7.33984385
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.00245710246
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.601870507482
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.753854725551
        },
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 8.888671975
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.6970139383099999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.8227651727649999
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.09391134871
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 6.1044922875
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.0767219831700001
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.493014971564
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0259133180666
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.5901260963999999
        },
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.596535799197
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.5191473562179999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32Distance",
          "operator": "lt",
          "threshold": 27.2744141625
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.720973363022
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.012485366864
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0130090283068
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.6988330443149999
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0393321894237
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignedAlpha8Overlap",
          "operator": "gt",
          "threshold": 0.748579633122
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.01306467633
        },
        {
          "featureName": "wideLuma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.604753538757
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignedEdge8Distance",
          "operator": "lt",
          "threshold": 4.1640626
        },
        {
          "featureName": "alignedLuma8Distance",
          "operator": "lt",
          "threshold": 3.2343751
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.0767219831700001
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.5269842269839999
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.752923638231
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftDistance",
          "operator": "lt",
          "threshold": 6.5312501
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.09391134871
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.6988330443149999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftDistance",
          "operator": "lt",
          "threshold": 9.4033204125
        },
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.383157601634
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.03703713704
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.01587311587
        },
        {
          "featureName": "rightProfileDistance",
          "operator": "lt",
          "threshold": 0.0916667666667
        },
        {
          "featureName": "wideLuma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.5266082635939999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.6834262241969999
        },
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.018190742979499998
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.6426961661489999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.5901260963999999
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.09391134871
        },
        {
          "featureName": "lumaShiftDistance",
          "operator": "lt",
          "threshold": 5.92578135
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.08823539412
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.609775902868
        },
        {
          "featureName": "lumaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0165086116316
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignedAlpha8Overlap",
          "operator": "gt",
          "threshold": 0.8369097712450001
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.6426961661489999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 7.2412110375
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.7940923811559999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignedLuma8Distance",
          "operator": "lt",
          "threshold": 3.2343751
        },
        {
          "featureName": "alphaCorrelation",
          "operator": "gt",
          "threshold": 0.975559136657
        },
        {
          "featureName": "lowerProfileDistance",
          "operator": "lt",
          "threshold": 0.00833343333333
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.8227651727649999
        },
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.08823539412
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 6.1044922875
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.09391134871
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 4.6162110375
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.5269842269839999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignedAlpha8Distance",
          "operator": "lt",
          "threshold": 5.51953135
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.855436260982
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignedAlpha8Overlap",
          "operator": "gt",
          "threshold": 0.848357424828
        },
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.6388252491509999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignedLuma8Distance",
          "operator": "lt",
          "threshold": 3.2343751
        },
        {
          "featureName": "alignmentScaleDelta",
          "operator": "lt",
          "threshold": 1e-7
        },
        {
          "featureName": "alphaCorrelation",
          "operator": "gt",
          "threshold": 0.975559136657
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alignedEdge8Distance",
          "operator": "lt",
          "threshold": 5.90234385
        },
        {
          "featureName": "alignedLuma8Distance",
          "operator": "lt",
          "threshold": 3.2343751
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 5.7656251
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.596535799197
        },
        {
          "featureName": "rightProfileDistance",
          "operator": "lt",
          "threshold": 0.00833343333333
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.7452967714909999
        },
        {
          "featureName": "silhouetteDistance",
          "operator": "lt",
          "threshold": 8.79364023672
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.6773470653410001
        },
        {
          "featureName": "wideLuma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.7665475925109999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftDistance",
          "operator": "lt",
          "threshold": 10.330078225
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0217392304300001
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.5707355200359999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.0169666434724
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.609775902868
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.998031596063
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.463357627511
        },
        {
          "featureName": "wideLuma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.5612319840579999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.596535799197
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.5191473562179999
        },
        {
          "featureName": "silhouetteShiftDistance",
          "operator": "lt",
          "threshold": 19.1125489281
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.10294127647
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.652232093766
        },
        {
          "featureName": "silhouetteShiftRatio",
          "operator": "lt",
          "threshold": 0.707207307207
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.06071438571
        },
        {
          "featureName": "lumaDistance",
          "operator": "lt",
          "threshold": 12.3906251
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.576132945483
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftDistance",
          "operator": "lt",
          "threshold": 7.5419922875
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.09391134871
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.6426961661489999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.464707931658
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.09391134871
        },
        {
          "featureName": "lumaShiftDistance",
          "operator": "lt",
          "threshold": 7.0937501
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.01306467633
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 8.958984475
        },
        {
          "featureName": "wideAlpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.433444522662
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.463357627511
        },
        {
          "featureName": "silhouetteShiftDistance",
          "operator": "lt",
          "threshold": 14.334411721099999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaOrientationDistance",
          "operator": "lt",
          "threshold": 0.018190742979499998
        },
        {
          "featureName": "alphaShiftDistance",
          "operator": "lt",
          "threshold": 6.5312501
        },
        {
          "featureName": "luma32ShiftRatio",
          "operator": "lt",
          "threshold": 0.6988330443149999
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "areaRatio",
          "operator": "lt",
          "threshold": 1.08823539412
        },
        {
          "featureName": "lumaCorrelation",
          "operator": "gt",
          "threshold": 0.327263602689
        },
        {
          "featureName": "lumaShiftRatio",
          "operator": "lt",
          "threshold": 0.576132945483
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alpha32ShiftRatio",
          "operator": "lt",
          "threshold": 0.616161716162
        },
        {
          "featureName": "luma32Distance",
          "operator": "lt",
          "threshold": 8.07421885
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaShiftRatio",
          "operator": "lt",
          "threshold": 0.695163498693
        },
        {
          "featureName": "silhouetteDistance",
          "operator": "lt",
          "threshold": 11.9219971703
        }
      ]
    },
    {
      "conditions": [
        {
          "featureName": "alphaChamferShiftRatio",
          "operator": "lt",
          "threshold": 0.626780679623
        },
        {
          "featureName": "aspectRatio",
          "operator": "lt",
          "threshold": 1.0294118647100001
        },
        {
          "featureName": "luma32ShiftDistance",
          "operator": "lt",
          "threshold": 6.08203135
        }
      ]
    }
  ]
}
